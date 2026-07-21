const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  // معلومات الاشتراك من المتصفح
  endpoint: {
    type: String,
    required: true,
    unique: true,
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  // ربط المستخدم (اختياري) - يمكن ربطه ببريد ولي الأمر أو المدير
  userEmail: {
    type: String,
    default: null,
  },
  // دور المستخدم (اختياري) للتصفية
  role: {
    type: String,
    enum: ['admin', 'parent', null],
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);