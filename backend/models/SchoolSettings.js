const mongoose = require('mongoose');

const SchoolSettingsSchema = new mongoose.Schema({
  schoolName: {
    type: String,
    default: 'ابتدائية عقبة بن نافع',
  },
  address: {
    type: String,
    default: 'شاطئ لافونتان عين البنيان، الجزائر العاصمة',
  },
  phone: {
    type: String,
    default: '0542163526',
  },
  email: {
    type: String,
    default: 'stevenhacen@gmail.com',
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
