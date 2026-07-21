const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const auth = require('../middleware/auth');

// تسجيل اشتراك جديد (أو تحديث)
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription, userEmail, role } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'بيانات اشتراك غير صالحة' });
    }

    // ✅ تحديد tenantId: إذا كان المستخدم مديراً عاماً (super_admin)، نسمح بأن يكون null
    let tenantId = null;
    if (req.user.role === 'super_admin') {
      tenantId = null; // المدير العام لا يتبع مؤسسة
    } else {
      // باقي المستخدمين يأخذون tenantId من المستخدم المصادق
      tenantId = req.user.tenantId;
      if (!tenantId) {
        // إذا لم يكن للمستخدم tenantId، نحاول جلبها من الـ Tenant عبر البريد الإلكتروني (كحل احتياطي)
        const User = require('../models/User');
        const user = await User.findById(req.user.id);
        if (user && user.tenantId) {
          tenantId = user.tenantId;
        }
      }
    }

    // البحث عن اشتراك موجود بنفس endpoint
    let existing = await Subscription.findOne({ endpoint: subscription.endpoint });

    if (existing) {
      // تحديث البيانات
      existing.keys = subscription.keys;
      existing.userEmail = userEmail || req.user.email;
      existing.role = role || req.user.role;
      existing.tenantId = tenantId; // تحديث tenantId (قد يكون null للمدير العام)
      await existing.save();
    } else {
      // إنشاء اشتراك جديد
      const newSubscription = new Subscription({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userEmail: userEmail || req.user.email,
        role: role || req.user.role,
        tenantId: tenantId, // قد يكون null للمدير العام
      });
      await newSubscription.save();
    }

    res.status(201).json({ success: true, message: 'تم تسجيل الاشتراك بنجاح' });
  } catch (err) {
    console.error('❌ خطأ في تسجيل الاشتراك:', err);
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

// جلب جميع الاشتراكات (للمدير العام فقط)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'غير مصرح' });
    }
    // إذا كان مديراً عاماً، يرى كل الاشتراكات، وإذا كان مدير مؤسسة يرى اشتراكات مؤسسته فقط
    let filter = {};
    if (req.user.role === 'admin') {
      filter.tenantId = req.user.tenantId;
    }
    const subscriptions = await Subscription.find(filter);
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
