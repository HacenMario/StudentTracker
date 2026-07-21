const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  endpoint: {
    type: String,
    required: true,
    unique: true,
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userEmail: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    enum: ['admin', 'parent', 'super_admin', null],
    default: null,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null, // ✅ يسمح بقيمة null للمدير العام
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
