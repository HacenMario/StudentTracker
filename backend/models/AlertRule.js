const mongoose = require('mongoose');

const AlertRuleSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['absence', 'tardiness', 'achievement'],
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  // شروط التنبيه
  conditions: {
    // للغياب المتكرر
    absenceConsecutiveDays: { type: Number, default: 3 },
    absenceMonthlyDays: { type: Number, default: 5 },
    // للتأخر
    tardinessPerWeek: { type: Number, default: 3 },
    // للإنجاز
    achievementConsecutiveDays: { type: Number, default: 10 },
    achievementMonthlyDays: { type: Number, default: 20 },
  },
  // فترة منع التكرار (أيام)
  cooldownDays: {
    type: Number,
    default: 7,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('AlertRule', AlertRuleSchema);
