const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/auth');

// جلب جميع المؤسسات (للمدير العام فقط)
router.get('/', auth, isSuperAdmin, async (req, res) => {
  try {
    const tenants = await Tenant.find().populate('adminId', 'name email');
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء مؤسسة جديدة (للمدير العام فقط)
router.post('/', auth, isSuperAdmin, async (req, res) => {
  try {
    const { name, subdomain, address, phone, email, adminEmail } = req.body;

    // التحقق من وجود النطاق الفرعي
    const existing = await Tenant.findOne({ subdomain });
    if (existing) {
      return res.status(400).json({ message: 'النطاق الفرعي مستخدم بالفعل' });
    }

    // البحث عن المدير
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      return res.status(404).json({ message: 'المدير غير موجود' });
    }

    const tenant = new Tenant({
      name,
      subdomain,
      address,
      phone,
      email,
      adminId: admin._id,
    });
    await tenant.save();

    // تحديث المدير ليرتبط بالمؤسسة
    admin.tenantId = tenant._id;
    admin.role = 'admin';
    await admin.save();

    res.status(201).json(tenant);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث مؤسسة (للمدير العام فقط)
router.put('/:id', auth, isSuperAdmin, async (req, res) => {
  try {
    const { name, address, phone, email, isActive } = req.body;
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { name, address, phone, email, isActive, updatedAt: new Date() },
      { new: true }
    );
    if (!tenant) {
      return res.status(404).json({ message: 'المؤسسة غير موجودة' });
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
