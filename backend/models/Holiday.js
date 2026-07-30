const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: Date, required: true },
  endDate: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  isRecurring: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Holiday', holidaySchema);
