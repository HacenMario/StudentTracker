const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  isRecurring: {
    type: Boolean,
    default: false, // إذا كانت العطلة تتكرر سنوياً (مثل عيد الفطر)
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Holiday', HolidaySchema);
