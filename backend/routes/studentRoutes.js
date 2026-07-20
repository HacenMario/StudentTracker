const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');

// استيراد مكتبة QR Code مع التحقق من وجودها
let QRCode;
try {
  QRCode = require('qrcode');
} catch (err) {
  console.error('❌ مكتبة qrcode غير مثبتة. قم بتشغيل: npm install qrcode');
  QRCode = null;
}

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
// 6. مسح QR Code (تغيير حالة الطالب عبر QR)
// ==========================================
router.post('/scan-qr', auth, async (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) return res.status(400).json({ success: false, message: 'بيانات QR مطلوبة' });

    const student = await Student.findOne({ studentId: qrData });
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
// 7. تحميل QR Code كصورة (للمدير وولي الأمر) - النسخة المُعدّلة
// ==========================================
router.get('/:id/qr', auth, async (req, res) => {
  try {
    // 1. التحقق من وجود المكتبة
    if (!QRCode) {
      console.error('❌ مكتبة qrcode غير مثبتة');
      return res.status(500).json({ message: 'مكتبة QR Code غير مثبتة على الخادم' });
    }

    // 2. البحث عن الطالب
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'الطالب غير موجود' });
    }

    // 3. التحقق من الصلاحية
    if (req.user.role === 'parent' && student.parent.toString() !== req.user.id) {
      return res.status(403).json({ message: 'غير مصرح لك بتحميل QR لهذا الطالب' });
    }

    // 4. تجهيز البيانات
    const qrData = student.studentId || student._id.toString();

    // 5. توليد QR Code كـ Buffer
    const qrCodeBuffer = await QRCode.toBuffer(qrData, {
      type: 'png',
      width: 300,
      margin: 4,
      color: {
        dark: '#1a365d',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H', // مستوى تصحيح أخطاء عالي
    });

    // 6. إرسال الصورة
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename=QR_${student.name}_${student.studentId}.png`);
    res.send(qrCodeBuffer);

  } catch (err) {
    console.error('❌ خطأ في توليد QR Code:', err);
    // إرسال رسالة خطأ مفصلة للتصحيح
    res.status(500).json({ 
      message: 'فشل توليد QR Code', 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

module.exports = router;
