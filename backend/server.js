require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');

// استيراد النماذج
const Student = require('./models/Student');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const SchoolSettings = require('./models/SchoolSettings');
const Subscription = require('./models/Subscription');

// استيراد المسارات
const studentRoutes = require('./routes/studentRoutes');
const authRoutes = require('./routes/authRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

// استيراد دالة الإشعارات من الملف المنفصل
const { sendPushNotificationToAll } = require('./utils/notifications');

const app = express();
const server = http.createServer(app);

// تعريف io (يجب أن يكون قبل أي استخدام له)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.set('io', io);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// تسجيل المسارات
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// ==========================================
// إعداد Web Push (VAPID)
// ==========================================
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  console.warn('⚠️ مفاتيح VAPID غير موجودة في ملف .env، الإشعارات لن تعمل');
} else {
  webpush.setVapidDetails(
    'mailto:info@school.edu',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('✅ تم إعداد VAPID للإشعارات');
}

// ==========================================
// Socket.io مع التحقق من التوكن وتخزين المستخدمين
// ==========================================
const userSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userEmail = socket.user.email;
  userSockets.set(userEmail, socket.id);
  console.log(`🟢 عميل متصل: ${userEmail} (الدور: ${socket.user.role})`);

  // ----------------------
  // 1. إشعار عام من المدير
  // ----------------------
  socket.on('admin-notification', async (data) => {
    if (socket.user.role !== 'admin') return;

    try {
      const notification = new Notification({
        target: 'all',
        message: data.message,
      });
      await notification.save();

      // بث عبر Socket للمستخدمين المتصلين
      io.emit('notification', {
        message: data.message,
        notificationId: notification._id,
        createdAt: notification.createdAt,
      });

      // إرسال Web Push لجميع المشتركين
      await sendPushNotificationToAll(
        '📢 إشعار من المدرسة',
        data.message,
        { url: '/' }
      );

      console.log(`📢 تم إرسال إشعار عام: ${data.message}`);
    } catch (err) {
      console.error('❌ خطأ في إرسال الإشعار العام:', err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار العام' });
    }
  });

  // ----------------------
  // 2. إشعار خاص لولي أمر معين
  // ----------------------
  socket.on('admin-notification-to-parent', async (data) => {
    if (socket.user.role !== 'admin') {
      socket.emit('notification-error', { message: 'غير مصرح لك' });
      return;
    }

    const { parentEmail, message } = data;
    if (!parentEmail || !message) {
      socket.emit('notification-error', { message: 'البريد الإلكتروني والرسالة مطلوبان' });
      return;
    }

    try {
      const notification = new Notification({
        target: parentEmail,
        message: message,
      });
      await notification.save();

      // إرسال عبر Socket للمستخدم المتصل إن وجد
      const targetSocketId = userSockets.get(parentEmail);
      if (targetSocketId) {
        io.to(targetSocketId).emit('notification', {
          message,
          notificationId: notification._id,
          createdAt: notification.createdAt,
        });
        socket.emit('notification-sent', {
          parentEmail,
          message: message + ' (تم الإرسال فوراً)',
        });
      } else {
        socket.emit('notification-sent', {
          parentEmail,
          message: message + ' (تم الحفظ، سيظهر عند تسجيل الدخول)',
        });
      }

      // إرسال Web Push لجميع المشتركين (لضمان الوصول)
      await sendPushNotificationToAll(
        '📩 إشعار خاص من المدرسة',
        message,
        { url: '/parent-dashboard' }
      );

      console.log(`📩 تم إرسال إشعار خاص لـ ${parentEmail}`);
    } catch (err) {
      console.error('❌ خطأ في إرسال الإشعار الخاص:', err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار الخاص' });
    }
  });

  // ----------------------
  // 3. تغيير حالة جميع الطلاب دفعة واحدة
  // ----------------------
  socket.on('toggle-all-status', async (data) => {
    if (socket.user.role !== 'admin') {
      socket.emit('error', { message: 'غير مصرح لك' });
      return;
    }

    const { newStatus } = data;
    try {
      const students = await Student.find();
      const updatedParents = new Set();

      for (const student of students) {
        student.isInside = newStatus;
        student.lastUpdate = new Date();
        await student.save();

        const attendance = new Attendance({
          student: student._id,
          status: newStatus ? 'in' : 'out',
          method: 'manual',
        });
        await attendance.save();

        if (student.parentEmail) updatedParents.add(student.parentEmail);
      }

      const statusText = newStatus ? 'داخل 🏫' : 'خارج 🚪';
      const message = `تم تغيير حالة جميع الطلاب إلى ${statusText}`;

      // بث عبر Socket
      io.emit('status-changed', {
        message: message,
        isBulk: true,
      });

      // إنشاء إشعارات لكل ولي أمر في قاعدة البيانات
      for (const email of updatedParents) {
        const notification = new Notification({
          target: email,
          message: message,
          sender: 'Admin',
        });
        await notification.save();
      }

      // إرسال Web Push لجميع المشتركين
      await sendPushNotificationToAll(
        'تحديث جماعي',
        message,
        { url: '/parent-dashboard' }
      );

      console.log(`🔄 تم تغيير حالة جميع الطلاب إلى ${statusText}`);
    } catch (error) {
      console.error('❌ خطأ في التغيير الجماعي:', error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة الجماعية' });
    }
  });

  // ----------------------
  // 4. انقطاع الاتصال
  // ----------------------
  socket.on('disconnect', () => {
    userSockets.delete(userEmail);
    console.log(`🔴 عميل غير متصل: ${userEmail}`);
  });
});

// ==========================================
// الاتصال بقاعدة البيانات وبدء الخادم
// ==========================================
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ متصل بـ MongoDB بنجاح');
  server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
  });
})
.catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));
