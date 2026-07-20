const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
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
router.get('/:id/qr', auth, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ message: 'الطالب غير موجود' });
        }

        // التحقق من الصلاحية: المدير يرى الكل، ولي الأمر يرى فقط أبناءه
        if (req.user.role === 'parent') {
            // التأكد من أن هذا الطالب مرتبط بهذا المستخدم (ولي الأمر)
            if (student.parent.toString() !== req.user.id) {
                return res.status(403).json({ message: 'غير مصرح لك برؤية هذا الطالب' });
            }
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'غير مصرح لك' });
        }

        // التحقق من وجود QR Code، وإن لم يكن موجوداً نقوم بتوليده
        let qrCodeData = student.qrCode;
        if (!qrCodeData) {
            // توليد QR جديد
            const QRCode = require('qrcode');
            const qrText = student.studentId; // أو أي معرف فريد
            qrCodeData = await QRCode.toDataURL(qrText);
            student.qrCode = qrCodeData;
            await student.save();
        }

        // تحويل base64 إلى buffer وإرسال الصورة
        const base64Data = qrCodeData.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');

        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': imgBuffer.length,
            'Content-Disposition': `attachment; filename=QR_${student.studentId}.png`,
        });
        res.end(imgBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 6. توليد QR Code لطالب (للمدير فقط)
// ==========================================
router.get('/:id/qr', auth, isAdmin, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ message: 'الطالب غير موجود' });
        }

        // التأكد من وجود qrCode، وإن لم يوجد نولده
        let qrData = student.qrCode;
        if (!qrData) {
            // إنشاء نص فريد للـ QR (مثلاً studentId + timestamp)
            qrData = `STU-${student.studentId}-${Date.now()}`;
            student.qrCode = qrData;
            await student.save();
        }

        // توليد صورة QR Code كـ Buffer
        const QRCode = require('qrcode');
        const qrBuffer = await QRCode.toBuffer(qrData, {
            type: 'png',
            width: 300,
            margin: 2,
            color: {
                dark: '#1a365d',  // لون النقاط (أزرق غامق)
                light: '#ffffff'  // لون الخلفية (أبيض)
            }
        });

        // تعيين الـ Headers المناسبة لتحميل الملف
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="QR_${student.studentId || student._id}.png"`);
        res.setHeader('Content-Length', qrBuffer.length);
        res.send(qrBuffer);

    } catch (err) {
        console.error('خطأ في توليد QR:', err);
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
