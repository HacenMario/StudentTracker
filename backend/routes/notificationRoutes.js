const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// جلب إشعارات المستخدم الحالي (ولي الأمر أو المدير)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'parent') {
      // ولي الأمر يرى الإشعارات العامة (target = 'all') والخاصة به (target = بريده)
      query = { $or: [{ target: 'all' }, { target: req.user.email }] };
    } else if (req.user.role === 'admin') {
      // المدير يرى كل الإشعارات (للمتابعة)
      query = {};
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // آخر 50 إشعار
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث حالة الإشعار إلى "مقروء"
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'غير موجود' });
    
    // تحقق من الصلاحية (يجب أن يكون المستهدف هو هذا المستخدم أو إشعار عام)
    if (req.user.role === 'parent') {
      if (notification.target !== 'all' && notification.target !== req.user.email) {
        return res.status(403).json({ message: 'غير مصرح لك' });
      }
    }
    
    notification.isRead = true;
    await notification.save();
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// جلب إشعارات المستخدم الحالي (ولي الأمر أو المدير)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'parent') {
      // ولي الأمر يرى الإشعارات العامة (target = 'all') والخاصة به (target = بريده)
      query = { $or: [{ target: 'all' }, { target: req.user.email }] };
    } else if (req.user.role === 'admin') {
      // المدير يرى كل الإشعارات (للمتابعة)
      query = {};
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // آخر 50 إشعار
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث حالة الإشعار إلى "مقروء"
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'غير موجود' });
    
    // تحقق من الصلاحية (يجب أن يكون المستهدف هو هذا المستخدم أو إشعار عام)
    if (req.user.role === 'parent') {
      if (notification.target !== 'all' && notification.target !== req.user.email) {
        return res.status(403).json({ message: 'غير مصرح لك' });
      }
    }
    
    notification.isRead = true;
    await notification.save();
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
