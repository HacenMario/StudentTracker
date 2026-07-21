const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const webpush = require('web-push');
const auth = require('../middleware/auth');

// تسجيل اشتراك جديد (أو تحديث)
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription, userEmail, role } = req.body;

    // التحقق من صحة الاشتراك
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'بيانات اشتراك غير صالحة' });
    }

    // البحث عن اشتراك بنفس endpoint
    let existing = await Subscription.findOne({ endpoint: subscription.endpoint });

    if (existing) {
      // تحديث البيانات إذا تغيرت
      existing.keys = subscription.keys;
      existing.userEmail = userEmail || existing.userEmail;
      existing.role = role || existing.role;
      await existing.save();
    } else {
      // إنشاء اشتراك جديد
      const newSubscription = new Subscription({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userEmail: userEmail || null,
        role: role || null,
      });
      await newSubscription.save();
    }

    // إرسال إشعار تجريبي للتأكد من صحة الاشتراك (اختياري)
    // يمكن إلغاء التعليق إذا أردت إرسال إشعار ترحيبي فوري
    /*
    const payload = JSON.stringify({
      title: 'تم التسجيل بنجاح',
      body: 'ستصلك الإشعارات من المدرسة الآن',
      icon: '/logo.png',
    });
    await webpush.sendNotification(subscription, payload);
    */

    res.status(201).json({ success: true, message: 'تم تسجيل الاشتراك بنجاح' });
  } catch (err) {
    console.error('خطأ في تسجيل الاشتراك:', err);
    res.status(500).json({ message: 'فشل تسجيل الاشتراك', error: err.message });
  }
});

// إلغاء الاشتراك (حذف)
router.delete('/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ message: 'endpoint مطلوب' });
    }

    const result = await Subscription.findOneAndDelete({ endpoint });
    if (result) {
      res.json({ success: true, message: 'تم إلغاء الاشتراك' });
    } else {
      res.status(404).json({ message: 'الاشتراك غير موجود' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// جلب جميع الاشتراكات (للمدير فقط)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'غير مصرح' });
    }
    const subscriptions = await Subscription.find();
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;