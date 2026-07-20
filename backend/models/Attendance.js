const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  // حالة الدخول (داخل/خارج)
  status: {
    type: String,
    enum: ['in', 'out'],
    required: true,
  },
  // التاريخ والوقت الكامل
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // طريقة التسجيل (يدوي/آلي)
  method: {
    type: String,
    enum: ['manual', 'rfid', 'auto'],
    default: 'manual',
  },
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
