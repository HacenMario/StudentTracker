const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// ==========================================
// 1. جلب إشعارات المستخدم الحالي
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'parent') {
      // ولي الأمر يرى الإشعارات العامة (target = 'all') والخاصة به (target = بريده)
      query = { $or: [{ target: 'all' }, { target: req.user.email }] };
    } else if (req.user.role === 'admin') {
      // المدير يرى كل الإشعارات (للمتابعة)
      query = {};
    } else {
      // أي دور آخر (غير متوقع) لا يرى شيئاً
      return res.status(403).json({ message: 'غير مصرح لك' });
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // آخر 50 إشعار

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 2. تحديث حالة الإشعار إلى "مقروء"
// ==========================================
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'الإشعار غير موجود' });
    }

    // التحقق من الصلاحية
    if (req.user.role === 'parent') {
      // ولي الأمر يمكنه تحديث الإشعارات العامة أو الخاصة به فقط
      if (notification.target !== 'all' && notification.target !== req.user.email) {
        return res.status(403).json({ message: 'غير مصرح لك بتحديث هذا الإشعار' });
      }
    } else if (req.user.role === 'admin') {
      // المدير يمكنه تحديث أي إشعار (اختياري)
      // يمكنك إضافة منطق إضافي هنا إذا أردت
    } else {
      return res.status(403).json({ message: 'غير مصرح لك' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ message: 'تم تحديث الإشعار كمقروء', notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
