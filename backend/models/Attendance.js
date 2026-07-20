const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  status: {
    type: String,
    enum: ['in', 'out'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  method: {
    type: String,
    enum: ['manual', 'rfid', 'auto', 'qr'], // أضفنا 'qr' هنا
    default: 'manual',
  },
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
