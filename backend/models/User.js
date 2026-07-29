const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  phone: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'parent', 'teacher'], // ✅ إضافة super_admin
    default: 'parent',
  },
  // ✅ ربط المستخدم بالمؤسسة (Multi-Tenant)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
  },
  // ✅ الإعدادات الشخصية (اللغة المفضلة)
  preferences: {
    language: {
      type: String,
      enum: ['ar', 'en', 'fr'],
      default: 'ar',
    },
  },
  // ✅ الطلاب المرتبطين به (إذا كان ولي أمر)
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// تشفير كلمة المرور قبل الحفظ
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// دالة للتحقق من كلمة المرور
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
