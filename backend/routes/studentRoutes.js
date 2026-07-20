const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');

// ==========================================
// 1. جلب الطلاب (حسب الدور)
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'parent') {
      // ولي الأمر يرى أبناءه فقط
      const students = await Student.find({ parent: req.user.id }).populate('parent', 'name email');
      return res.json(students);
    }
    // المدير يرى الجميع
    const students = await Student.find().populate('parent', 'name email');
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 2. إضافة طالب جديد (للمدير فقط)
// ==========================================
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const { name, parentEmail, parentName, parentPhone, address } = req.body;

    // البحث عن ولي الأمر باستخدام البريد الإلكتروني
    let parent = await User.findOne({ email: parentEmail, role: 'parent' });
    if (!parent) {
      return res.status(400).json({ message: 'ولي الأمر غير موجود، يجب تسجيله أولاً' });
    }

    const newStudent = new Student({
      name,
      parent: parent._id,
      parentName: parentName || parent.name,
      parentPhone: parentPhone || parent.phone,
      parentEmail: parent.email,
      address: address || '',
    });

    await newStudent.save();

    // إضافة الطالب إلى قائمة أبناء ولي الأمر
    parent.students.push(newStudent._id);
    await parent.save();

    res.status(201).json(newStudent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 3. تبديل حالة الطالب (داخل/خارج) - للمدير فقط
// ==========================================
router.put('/:id/toggle', auth, isAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    // تسجيل في سجل الحضور
    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'manual',
    });
    await attendance.save();

    // إرسال إشعار عبر Socket.io (سيتم بثه من server.js)
    const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
    const message = `التلميذ ${student.name} أصبح ${statusText}`;
    const io = req.app.get('io');
    io.emit('status-changed', {
      student: student,
      message: message,
      parentId: student.parent ? student.parent.toString() : null,
      parentEmail: student.parentEmail,
    });

    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 4. حذف طالب (للمدير فقط)
// ==========================================
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    // إزالة الطالب من قائمة أبناء ولي الأمر
    await User.updateOne(
      { _id: student.parent },
      { $pull: { students: student._id } }
    );

    // حذف سجل الحضور المرتبط به
    await Attendance.deleteMany({ student: student._id });

    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 5. جلب سجل الحضور لطالب معين (لولي الأمر أو المدير)
// ==========================================
router.get('/:id/attendance', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    // التحقق من الصلاحية: ولي الأمر يرى فقط أبناءه
    if (req.user.role === 'parent' && student.parent.toString() !== req.user.id) {
      return res.status(403).json({ message: 'غير مصرح لك برؤية هذا السجل' });
    }

    const records = await Attendance.find({ student: student._id })
      .sort({ timestamp: -1 })
      .limit(30);

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ==========================================
// 6. توليد QR Code لطالب (للمدير فقط)
// ==========================================
router.get('/:id/qr', auth, isAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود' });

    // إذا لم يكن هناك qrCode، قم بإنشائه
    if (!student.qrCode) {
      student.qrCode = 'QR-' + (student.studentId || student._id.toString());
      await student.save();
    }

    // توليد صورة QR كـ Data URL
    const QRCode = require('qrcode');
    const qrImage = await QRCode.toDataURL(student.qrCode);

    res.json({ qrCode: student.qrCode, qrImage });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 7. مسح QR Code (تغيير حالة الطالب)
// ==========================================
router.post('/scan-qr', auth, async (req, res) => {
  try {
    const { qrText } = req.body;
    if (!qrText) return res.status(400).json({ message: 'نص QR مطلوب' });

    // البحث عن الطالب بواسطة qrCode
    const student = await Student.findOne({ qrCode: qrText });
    if (!student) {
      return res.status(404).json({ message: 'QR Code غير صالح' });
    }

    // التحقق من الصلاحية: المدير يمكنه مسح أي طالب، ولي الأمر فقط أبناءه
    if (req.user.role === 'parent') {
      if (student.parent.toString() !== req.user.id) {
        return res.status(403).json({ message: 'غير مصرح لك بمسح هذا الطالب' });
      }
    }

    // تغيير الحالة
    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    // تسجيل في سجل الحضور
    const Attendance = require('../models/Attendance');
    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'qr', // تمييز طريقة الدخول
    });
    await attendance.save();

    // إرسال إشعار عبر Socket.io
    const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
    const message = `التلميذ ${student.name} أصبح ${statusText} (عبر QR)`;
    const io = req.app.get('io');
    io.emit('status-changed', {
      student: student,
      message: message,
      parentId: student.parent.toString(),
      parentEmail: student.parentEmail,
    });

    res.json({ student, message });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
