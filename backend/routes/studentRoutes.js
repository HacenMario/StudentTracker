const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const QRCode = require('qrcode'); // تأكد من تثبيت هذه المكتبة

// ==========================================
// 1. جلب الطلاب (حسب الدور)
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'parent') {
      const students = await Student.find({ parent: req.user.id }).populate('parent', 'name email');
      return res.json(students);
    }
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

    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'manual',
    });
    await attendance.save();

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

    await User.updateOne(
      { _id: student.parent },
      { $pull: { students: student._id } }
    );

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

    // النص الذي سيتم ترميزه في QR (يمكن أن يكون معرف الطالب أو رابط)
    const qrData = JSON.stringify({
      studentId: student._id,
      name: student.name,
      school: 'SchoolName' // يمكنك إضافة اسم المدرسة من الإعدادات
    });

    // توليد QR كـ Data URL (صورة بصيغة PNG)
    const qrImage = await QRCode.toDataURL(qrData);

    res.json({ qrImage, studentName: student.name, studentId: student._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'فشل توليد QR Code' });
  }
});

// ==========================================
// 7. مسح QR Code وتغيير الحالة (للمدير أو ولي الأمر؟)
// ==========================================
// يمكن أن يكون هذا المسار متاحاً للمدير فقط أو لأي مستخدم مسجل
// هنا سنجعله للمدير فقط (لأن التغيير يحتاج صلاحية)
router.post('/scan-qr', auth, isAdmin, async (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) return res.status(400).json({ message: 'بيانات QR مطلوبة' });

    // فك تشفير البيانات (نفس النص الذي تم توليده)
    let studentId;
    try {
      const parsed = JSON.parse(qrData);
      studentId = parsed.studentId;
    } catch (e) {
      // إذا لم تكن JSON، نفترض أن النص هو المعرف مباشرة
      studentId = qrData;
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود' });

    // تغيير الحالة (مثل الضغط على زر toggle)
    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'qr', // تحديد طريقة الدخول عبر QR
    });
    await attendance.save();

    const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
    const message = `التلميذ ${student.name} أصبح ${statusText} (عن طريق QR)`;
    const io = req.app.get('io');
    io.emit('status-changed', {
      student: student,
      message: message,
      parentId: student.parent ? student.parent.toString() : null,
      parentEmail: student.parentEmail,
    });

    res.json({
      success: true,
      student: student,
      message: `تم تغيير حالة ${student.name} إلى ${statusText}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'فشل مسح QR Code' });
  }
});

module.exports = router;
