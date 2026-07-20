const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  parentName: {
    type: String,
    required: true,
    trim: true,
  },
  parentPhone: {
    type: String,
    required: true,
    trim: true,
  },
  parentEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  address: {
    type: String,
    trim: true,
    default: '',
  },
  isInside: {
    type: Boolean,
    default: false,
  },
  lastUpdate: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ==========================================
// حل مشكلة تكرار studentId باستخدام عداد منفصل
// ==========================================

// إنشاء نموذج منفصل للعداد (سيتم إنشاؤه تلقائياً)
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.model('Counter', CounterSchema);

// دالة للحصول على الرقم التسلسلي التالي
async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

// قبل حفظ الطالب، قم بتوليد studentId فريد
StudentSchema.pre('save', async function(next) {
  if (this.isNew && !this.studentId) {
    try {
      const seq = await getNextSequence('studentId');
      this.studentId = 'STU-' + String(seq).padStart(4, '0');
      next();
    } catch (err) {
      next(err);
    }
  } else {
    next();
  }
});

module.exports = mongoose.model('Student', StudentSchema);
