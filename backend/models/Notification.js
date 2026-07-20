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
  },
  // تاريخ الإرسال
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Notification', NotificationSchema);
