const mongoose = require('mongoose');

const SmartAlertSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  parentEmail: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['absence', 'tardiness', 'achievement'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  isSent: {
    type: Boolean,
    default: false,
  },
  sentAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // لمنع التكرار
  alertKey: {
    type: String,
    unique: true,
    index: true,
  },
});

module.exports = mongoose.model('SmartAlert', SmartAlertSchema);
