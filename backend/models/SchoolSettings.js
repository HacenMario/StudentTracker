const mongoose = require('mongoose');

const SchoolSettingsSchema = new mongoose.Schema({
  schoolName: {
    type: String,
    default: 'مدرسة النور الابتدائية',
  },
  address: {
    type: String,
    default: 'شارع السلام، المدينة التعليمية',
  },
  phone: {
    type: String,
    default: '0555 123 456',
  },
  email: {
    type: String,
    default: 'info@school.edu',
  },
  logo: {
    type: String,
    default: '',
  },
  logoFileName: {
    type: String,
    default: '',
  },
  // ========== الحقول الجديدة للإشعارات التلقائية ==========
  schoolEndTime: {
    type: String,
    default: '16:00', // تنسيق HH:MM (24 ساعة)
  },
  notificationBeforeMinutes: {
    type: Number,
    default: 30, // عدد الدقائق قبل الخروج
  },
  // ======================================================
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SchoolSettings', SchoolSettingsSchema);
