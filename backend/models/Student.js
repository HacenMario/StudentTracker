const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  // المعرف الفريد الظاهر للطالب (رقم تسلسلي أو كود)
  studentId: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // معلومات ولي الأمر
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
  // الحالة (داخل/خارج)
  isInside: {
    type: Boolean,
    default: false,
  },
  lastUpdate: {
    type: Date,
    default: Date.now,
  },
  // ربط الطالب بالمستخدم (ولي الأمر) عبر الـ email
  parentEmail: { // مكرر ولكن للتأكيد
    type: String,
    required: true,
  },
  // تاريخ الإنشاء
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// إنشاء رقم طالب تلقائي قبل الحفظ (مثال: STU-0001)
StudentSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('Student').countDocuments();
    this.studentId = 'STU-' + String(count + 1).padStart(4, '0');
  }
  next();
});

module.exports = mongoose.model('Student', StudentSchema);
