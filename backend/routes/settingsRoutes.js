const express = require('express');
const router = express.Router();
const SchoolSettings = require('../models/SchoolSettings');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');

// جلب إعدادات المدرسة (للجميع)
router.get('/', async (req, res) => {
  try {
    let settings = await SchoolSettings.findOne();
    if (!settings) {
      settings = new SchoolSettings();
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث إعدادات المدرسة (للمدير فقط)
router.put('/', auth, isAdmin, async (req, res) => {
  try {
    const { 
      schoolName, address, phone, email, logo, logoFileName,
      schoolEndTime, notificationBeforeMinutes 
    } = req.body;
    
    let settings = await SchoolSettings.findOne();
    if (!settings) {
      settings = new SchoolSettings();
    }

    if (schoolName !== undefined) settings.schoolName = schoolName;
    if (address !== undefined) settings.address = address;
    if (phone !== undefined) settings.phone = phone;
    if (email !== undefined) settings.email = email;
    if (logo !== undefined) settings.logo = logo;
    if (logoFileName !== undefined) settings.logoFileName = logoFileName;
    
    // ✅ الحقول الجديدة
    if (schoolEndTime !== undefined) settings.schoolEndTime = schoolEndTime;
    if (notificationBeforeMinutes !== undefined) settings.notificationBeforeMinutes = notificationBeforeMinutes;
    
    settings.updatedAt = new Date();

    await settings.save();
    res.json(settings);
  } catch (err) {
    console.error('❌ خطأ في حفظ إعدادات المدرسة:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
