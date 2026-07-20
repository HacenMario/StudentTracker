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
  // حقل جديد لتخزين نص QR (فريد)
  qrCode: {
    type: String,
    unique: true,
    sparse: true, // يسمح بقيم null أو فريدة فقط عند وجود قيمة
  },
});

StudentSchema.pre('save', async function(next) {
  if (this.isNew && !this.studentId) {
    const count = await mongoose.model('Student').countDocuments();
    this.studentId = 'STU-' + String(count + 1).padStart(4, '0');
  }
  // إذا لم يكن هناك QR Code، قم بتوليده تلقائياً (يعتمد على _id)
  if (!this.qrCode) {
    // استخدم studentId أو _id كنص فريد
    this.qrCode = 'QR-' + (this.studentId || this._id.toString());
  }
  next();
});

module.exports = mongoose.model('Student', StudentSchema);
