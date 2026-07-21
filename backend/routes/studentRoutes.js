const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { sendPushNotificationToAll } = require('../utils/notifications');
const QRCode = require('qrcode');

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
// 3. تبديل حالة الطالب (للمدير فقط)
// ==========================================
router.put('/:id/toggle', auth, isAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'الطالب غير موجود' });
    }

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

    if (student.parentEmail) {
      const notification = new Notification({
        target: student.parentEmail,
        message: message,
        sender: 'Admin',
      });
      await notification.save();
    }

    const io = req.app.get('io');
    io.emit('status-changed', {
      student: student,
      message: message,
      parentId: student.parent ? student.parent.toString() : null,
      parentEmail: student.parentEmail,
    });

    await sendPushNotificationToAll(
      'تحديث حالة ابنك',
      message,
      { url: '/parent-dashboard' }
    );

    res.json(student);
  } catch (err) {
    console.error('❌ خطأ في تغيير حالة الطالب:', err);
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
// 5. جلب سجل الحضور لطالب معين
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
// 6. مسح QR Code
// ==========================================
router.post('/scan-qr', auth, async (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) return res.status(400).json({ success: false, message: 'بيانات QR مطلوبة' });

    const cleanData = qrData.trim();
    let student = await Student.findOne({ studentId: cleanData });
    
    if (!student && cleanData.match(/^[0-9a-fA-F]{24}$/)) {
      student = await Student.findById(cleanData);
    }

    if (!student) {
      return res.status(404).json({ success: false, message: 'الطالب غير موجود' });
    }

    if (req.user.role === 'parent' && student.parent.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتغيير حالة هذا الطالب' });
    }

    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'qr',
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

    res.json({ success: true, message: `تم تغيير حالة ${student.name} إلى ${statusText}` });
  } catch (err) {
    console.error('❌ خطأ في مسح QR:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة QR' });
  }
});

// ==========================================
// 7. تحميل QR Code كصورة
// ==========================================
router.get('/:id/qr', auth, async (req, res) => {
  try {
    if (!QRCode) {
      return res.status(500).json({ message: 'مكتبة QR Code غير مثبتة على الخادم' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'الطالب غير موجود' });
    }

    if (req.user.role === 'parent' && student.parent.toString() !== req.user.id) {
      return res.status(403).json({ message: 'غير مصرح لك بتحميل QR لهذا الطالب' });
    }

    const qrData = student.studentId || student._id.toString();
    const qrCodeBuffer = await QRCode.toBuffer(qrData, {
      type: 'png',
      width: 300,
      margin: 4,
      color: { dark: '#1a365d', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    const fileName = `QR_${student.name}_${student.studentId}.png`;
    const encodedFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFileName}"`);
    res.send(qrCodeBuffer);

  } catch (err) {
    console.error('❌ خطأ في توليد QR Code:', err);
    res.status(500).json({ 
      message: 'فشل توليد QR Code', 
      error: err.message,
    });
  }
});

// ==========================================
// 8. تعديل معلومات الطالب (للمدير فقط) - ✅ تمت الإضافة
// ==========================================
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { name, parentName, parentPhone, parentEmail, address } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'الطالب غير موجود' });
    }

    // تحديث الحقول
    student.name = name || student.name;
    student.parentName = parentName || student.parentName;
    student.parentPhone = parentPhone || student.parentPhone;
    student.parentEmail = parentEmail || student.parentEmail;
    student.address = address || student.address;

    await student.save();

    res.json({ message: 'تم تحديث معلومات الطالب بنجاح', student });
  } catch (err) {
    console.error('❌ خطأ في تعديل الطالب:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
