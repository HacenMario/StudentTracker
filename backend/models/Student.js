const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  // studentId غير مطلوب، سيتم توليده آلياً
  studentId: {
    type: String,
    unique: true,
    // إزالة required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
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

// قبل الحفظ، إذا لم يكن studentId موجوداً، قم بإنشائه
StudentSchema.pre('save', async function(next) {
  if (this.isNew && !this.studentId) {
    try {
      // الحصول على عدد الطلاب الحاليين لتوليد رقم تسلسلي
      const count = await mongoose.model('Student').countDocuments();
      this.studentId = 'STU-' + String(count + 1).padStart(4, '0');
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Student', StudentSchema);
