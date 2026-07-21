const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    unique: true,
    // لا نضع required: true لمنع أخطاء التحديث
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

// توليد studentId تلقائياً قبل الحفظ
StudentSchema.pre('save', async function(next) {
  if (this.isNew && !this.studentId) {
    try {
      const count = await mongoose.model('Student').countDocuments();
      this.studentId = 'STU-' + String(count + 1).padStart(4, '0');
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Student', StudentSchema);
