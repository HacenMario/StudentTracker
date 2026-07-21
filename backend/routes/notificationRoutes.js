const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// ==========================================
// 1. جلب إشعارات المستخدم الحالي (مع ترتيب تنازلي)
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
      return res.status(403).json({ message: 'غير مصرح لك' });
    }

    // جلب الإشعارات مع ترتيب تنازلي (الأحدث أولاً)
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(100); // آخر 100 إشعار

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
      if (notification.target !== 'all' && notification.target !== req.user.email) {
        return res.status(403).json({ message: 'غير مصرح لك بتحديث هذا الإشعار' });
      }
    }

    notification.isRead = true;
    await notification.save();

    res.json({ message: 'تم تحديث الإشعار كمقروء', notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 3. (اختياري) حذف إشعار (للمدير فقط)
// ==========================================
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'غير مصرح لك' });
    }
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الإشعار' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
