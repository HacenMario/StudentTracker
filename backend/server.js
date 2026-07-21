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

const app = express();
const server = http.createServer(app);
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
  console.warn('⚠️ مفاتيح VAPID غير موجودة، الإشعارات لن تعمل');
} else {
  webpush.setVapidDetails(
    'mailto:info@school.edu',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('✅ تم إعداد VAPID للإشعارات');
}

// ==========================================
// دالة إرسال إشعارات Web Push (مع سجلات تشخيصية)
// ==========================================
async function sendPushNotification(title, body, data = {}, targetEmail = null) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة، تخطي إرسال الإشعار');
      return;
    }

    // بناء الفلتر: إذا تم تحديد بريد، نبحث به، وإلا نرسل للجميع
    let filter = {};
    if (targetEmail) {
      filter = { userEmail: targetEmail };
      console.log(`🔍 البحث عن مشتركين للبريد: "${targetEmail}"`);
    } else {
      console.log(`🔍 إرسال إشعار لجميع المشتركين`);
    }

    const subscriptions = await Subscription.find(filter);
    console.log(`📊 عدد المشتركين الذين تم العثور عليهم: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn(`⚠️ لا يوجد مشتركين ${targetEmail ? 'للبريد: ' + targetEmail : ''}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data,
      url: data.url || '/',
    });

    // إرسال الإشعار لكل مشترك
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ تم إرسال الإشعار إلى مشترك (بريد: ${sub.userEmail || 'غير معروف'})`);
      } catch (err) {
        console.error(`❌ فشل إرسال الإشعار لمشترك (بريد: ${sub.userEmail}):`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
          console.log(`🗑️ تم حذف اشتراك منتهي: ${sub.endpoint.substring(0, 30)}...`);
        }
      }
    }

    console.log(`✅ انتهى إرسال الإشعارات`);

  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعارات:', err);
  }
}

// ==========================================
// Socket.io
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
  // 1. تبديل حالة الطالب (مع إرسال إشعار للجميع مؤقتاً)
  // ----------------------
socket.on('toggle-status', async (studentId) => {
  if (socket.user.role !== 'admin') {
    socket.emit('error', { message: 'غير مصرح لك' });
    return;
  }

  try {
    const student = await Student.findById(studentId);
    if (!student) {
      socket.emit('error', { message: 'الطالب غير موجود' });
      return;
    }

    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'manual',
    });
    await attendance.save();

    const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
    const message = `التلميذ ${student.name} أصبح ${statusText}`;

    io.emit('status-changed', {
      student: student,
      message: message,
      parentId: student.parent ? student.parent.toString() : null,
      parentEmail: student.parentEmail,
    });

    // ✅ إرسال الإشعار للجميع (اختبار)
    console.log(`📤 إرسال إشعار تغيير حالة للجميع (اختبار)`);
    await sendPushNotification(
      'تحديث حالة ابنك (اختبار)',
      message,
      { url: '/parent-dashboard' },
      null // إرسال للجميع
    );

    // ✅ (لاحقاً) يمكنك إعادة تفعيل الإرسال للبريد المحدد
    /*
    if (student.parentEmail) {
      await sendPushNotification(
        'تحديث حالة ابنك',
        message,
        { url: '/parent-dashboard' },
        student.parentEmail
      );
    }
    */

  } catch (error) {
    console.error(error);
    socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة' });
  }
});

  // ----------------------
  // 2. إشعار عام من المدير
  // ----------------------
  socket.on('admin-notification', async (data) => {
    if (socket.user.role !== 'admin') return;

    try {
      const notification = new Notification({
        target: 'all',
        message: data.message,
      });
      await notification.save();

      io.emit('notification', {
        message: data.message,
        notificationId: notification._id,
        createdAt: notification.createdAt
      });

      await sendPushNotification(
        '📢 إشعار من المدرسة',
        data.message,
        { url: '/' },
        null
      );

      console.log(`📢 تم إرسال إشعار عام: ${data.message}`);
    } catch (err) {
      console.error(err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار العام' });
    }
  });

  // ----------------------
  // 3. إشعار خاص لولي أمر
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

      const targetSocketId = userSockets.get(parentEmail);
      if (targetSocketId) {
        io.to(targetSocketId).emit('notification', {
          message,
          notificationId: notification._id,
          createdAt: notification.createdAt
        });
        socket.emit('notification-sent', {
          parentEmail,
          message: message + ' (تم الإرسال فوراً)'
        });
      } else {
        socket.emit('notification-sent', {
          parentEmail,
          message: message + ' (تم الحفظ، سيظهر عند تسجيل الدخول)'
        });
      }

      await sendPushNotification(
        '📩 إشعار خاص من المدرسة',
        message,
        { url: '/parent-dashboard' },
        parentEmail
      );
    } catch (err) {
      console.error(err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار الخاص' });
    }
  });

  // ----------------------
  // 4. تغيير حالة جميع الطلاب
  // ----------------------
  socket.on('toggle-all-status', async (data) => {
    if (socket.user.role !== 'admin') {
      socket.emit('error', { message: 'غير مصرح لك' });
      return;
    }

    const { newStatus } = data;
    try {
      const students = await Student.find();
      let updatedParents = new Set();

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

      io.emit('status-changed', {
        message: message,
        isBulk: true,
      });

      for (const email of updatedParents) {
        await sendPushNotification(
          'تحديث جماعي',
          message,
          { url: '/parent-dashboard' },
          email
        );
      }
    } catch (error) {
      console.error(error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة الجماعية' });
    }
  });

  socket.on('disconnect', () => {
    userSockets.delete(userEmail);
    console.log(`🔴 عميل غير متصل: ${userEmail}`);
  });
});

// ==========================================
// الاتصال بقاعدة البيانات
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
