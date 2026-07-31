const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // ميدل وير المصادقة
const User = require('../models/User');
const Student = require('../models/Student');
const Notification = require('../models/Notification');

// @route   GET /api/parent/my-children
// @desc    جلب جميع الأبناء المسجلين لهذا ولي الأمر
// @access  Private (يجب أن يكون ولي أمر)
router.get('/my-children', auth, async (req, res) => {
  try {
    // 1. جلب المستخدم (ولي الأمر) مع تعبئة قائمة الطلاب المرتبطين به
    const user = await User.findById(req.user.id).populate('students');
    if (!user) {
      return res.status(404).json({ msg: 'المستخدم غير موجود' });
    }

    // 2. التأكد من أن المستخدم له صلاحية ولي أمر
    if (user.role !== 'parent') {
      return res.status(403).json({ msg: 'غير مصرح لك بالوصول إلى هذه البيانات' });
    }

    // 3. إعادة قائمة الطلاب
    res.json(user.students);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('خطأ في الخادم');
  }
});

// @route   POST /api/parent/send-message
// @desc    إرسال رسالة من ولي الأمر إلى المدرسة
// @access  Private (يجب أن يكون ولي أمر)
router.post('/send-message', auth, async (req, res) => {
  try {
    // 1. التحقق من صلاحية ولي الأمر
    if (req.user.role !== 'parent') {
      return res.status(403).json({ msg: 'غير مصرح لك بإرسال رسائل' });
    }

    const { studentId, subject, message } = req.body;

    // 2. التحقق من وجود بيانات الطلب
    if (!studentId || !message) {
      return res.status(400).json({ msg: 'الرجاء تحديد الطالب ونص الرسالة' });
    }

    // 3. التأكد من أن الطالب المحدد يتبع لهذا ولي الأمر (لأمان البيانات)
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ msg: 'الطالب غير موجود' });
    }

    // مقارنة معرف ولي الأمر المخزن مع معرف المستخدم الحالي
    if (student.parent.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'هذا الطالب ليس تابعاً لك، لا يمكنك إرسال رسالة بخصوصه' });
    }

    // 4. إنشاء سجل إشعار جديد في قاعدة البيانات
    const newNotification = new Notification({
      sender: req.user.name, // اسم ولي الأمر
      target: 'admin', // إرسال للإداريين (يمكن تعديلها لاحقاً)
      subject: subject || 'رسالة من ولي أمر',
      message: `رسالة من ولي أمر الطالب (${student.name}): ${message}`,
      senderRole: 'parent',
      parentStudentId: studentId,
    });

    await newNotification.save();

    // (اختياري) هنا يمكن إضافة كود لإرسال إشعار فوري عبر WebSocket أو بريد إلكتروني

    res.json({ msg: 'تم إرسال رسالتك إلى المدرسة بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('خطأ في الخادم');
  }
});

module.exports = router;
