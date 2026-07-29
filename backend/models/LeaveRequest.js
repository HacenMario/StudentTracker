const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  parentEmail: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  fileUrl: {
    type: String, // Base64 أو رابط الصورة
    default: '',
  },
  fileName: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  adminNote: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);
