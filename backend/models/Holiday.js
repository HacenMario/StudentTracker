const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  endDate: { type: Date },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  isRecurring: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Holiday', holidaySchema);
