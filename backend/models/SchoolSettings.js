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
  // تخزين الصورة كـ Base64 (حد أقصى 1 ميجابايت)
  logo: {
    type: String,
    default: '',
  },
  // اسم الملف الأصلي (اختياري)
  logoFileName: {
    type: String,
    default: '',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SchoolSettings', SchoolSettingsSchema);
