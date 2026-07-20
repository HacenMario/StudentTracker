const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  // من هو المرسل (المدير)
  sender: {
    type: String,
    default: 'Admin',
  },
  // مستهدف الإشعار (إما 'all' أو بريد ولي الأمر)
  target: {
    type: String,
    required: true,
    index: true, // لتسريع البحث
  },
  // محتوى الرسالة
  message: {
    type: String,
    required: true,
  },
  // هل تمت قراءته؟
  isRead: {
    type: Boolean,
    default: false,
    index: true,
  },
  // تاريخ الإرسال
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model('Notification', NotificationSchema);
