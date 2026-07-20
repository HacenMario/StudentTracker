const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
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
  logoUrl: {
    type: String,
    default: '',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// نحرص على وجود سجل واحد فقط
SettingSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this();
    await settings.save();
  }
  return settings;
};

module.exports = mongoose.model('Setting', SettingSchema);
