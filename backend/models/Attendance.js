const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  status: {
    type: String,
    enum: ['in', 'out'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  method: {
    type: String,
    enum: ['manual', 'rfid', 'auto', 'qr'],
    default: 'manual',
  },
  // إضافة حقل لتخزين اسم الطالب لتسهيل العرض
  studentName: {
    type: String,
    default: '',
  },
  // إضافة حقل لتخزين حالة الطالب كنص
  statusText: {
    type: String,
    default: '',
  },
});

// قبل الحفظ، نقوم بتعبئة studentName و statusText
AttendanceSchema.pre('save', async function(next) {
  if (this.isNew && !this.studentName) {
    try {
      const Student = mongoose.model('Student');
      const student = await Student.findById(this.student);
      if (student) {
        this.studentName = student.name;
        this.statusText = this.status === 'in' ? 'داخل 🏫' : 'خارج 🚪';
      }
    } catch (err) {
      console.error('خطأ في تعبئة بيانات Attendance:', err);
    }
  }
  next();
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
