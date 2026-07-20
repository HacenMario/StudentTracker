const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');

// جلب الإعدادات (للجميع)
router.get('/', async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث الإعدادات (للمدير فقط)
router.put('/', auth, isAdmin, async (req, res) => {
  try {
    const { schoolName, address, phone, email, logoUrl } = req.body;
    let settings = await Setting.getSettings();
    settings.schoolName = schoolName || settings.schoolName;
    settings.address = address || settings.address;
    settings.phone = phone || settings.phone;
    settings.email = email || settings.email;
    settings.logoUrl = logoUrl || settings.logoUrl;
    settings.updatedAt = new Date();
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
