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
// دالة إرسال إشعارات Web Push (محسّنة مع تشخيص)
// ==========================================
async function sendPushNotification(title, body, data = {}, targetEmail = null) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة، تخطي إرسال الإشعار');
      return;
    }

    // بناء الفلتر
    let filter = {};
    let logMessage = '';

    if (targetEmail) {
      // ✅ البحث بالبريد الإلكتروني (أولوية)
      filter.userEmail = targetEmail;
      logMessage = `للبريد: ${targetEmail}`;
    } else {
      // بدون فلتر -> الإشعار العام للجميع
      filter = {};
      logMessage = 'لجميع المشتركين';
    }

    console.log(`📨 [بدء] إرسال إشعار: "${title}" - ${logMessage}`);

    const subscriptions = await Subscription.find(filter);
    
    // ✅ تشخيص إضافي: عرض عدد المشتركين الذين تم العثور عليهم
    console.log(`🔍 تم العثور على ${subscriptions.length} مشترك ${targetEmail ? 'لهذا البريد' : 'في النظام'}`);

    if (subscriptions.length === 0) {
      // ❌ لم نجد مشتركين، نعرض معلومات إضافية
      if (targetEmail) {
        // نتحقق من وجود أي اشتراك في النظام للمساعدة في التشخيص
        const allSubs = await Subscription.find();
        console.log(`📊 إجمالي المشتركين في النظام: ${allSubs.length}`);
        if (allSubs.length > 0) {
          console.log('📊 بريد أول مشترك:', allSubs[0].userEmail);
        }
      }
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

    // ✅ إرسال لكل مشترك
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ تم إرسال الإشعار إلى مشترك (بريد: ${sub.userEmail})`);
      })
    );

    // معالجة النتائج
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const error = result.reason;
        console.error(`❌ فشل إرسال الإشعار للمشترك ${index}:`, error.message || error);
        if (error && error.statusCode && (error.statusCode === 410 || error.statusCode === 404)) {
          const failedSub = subscriptions[index];
          if (failedSub) {
            Subscription.findByIdAndDelete(failedSub._id)
              .then(() => {
                console.log(`🗑️ تم حذف اشتراك منتهي: ${failedSub.endpoint.substring(0, 30)}...`);
              })
              .catch(err => console.warn('خطأ في حذف الاشتراك:', err));
          }
        }
      }
    });

    console.log(`✅ [انتهى] إرسال الإشعارات لـ ${logMessage}`);

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
  // 1. تبديل حالة الطالب (للمدير)
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

      // بث التحديث لجميع العملاء عبر Socket
      io.emit('status-changed', {
        student: student,
        message: message,
        parentId: student.parent ? student.parent.toString() : null,
        parentEmail: student.parentEmail,
      });

      // ✅ إرسال إشعار Web Push لولي الأمر
      if (student.parentEmail) {
        console.log(`📤 محاولة إرسال إشعار تغيير حالة إلى البريد: "${student.parentEmail}"`);
        
        // ✅ نرسل الإشعار مع تحديد البريد الإلكتروني
        await sendPushNotification(
          'تحديث حالة ابنك',
          message,
          { url: '/parent-dashboard' },
          student.parentEmail
        );
        
        // ✅ كحل احتياطي: إذا لم يكن هناك اشتراك، نرسل للجميع (اختياري)
        // جلب الاشتراكات للتحقق
        const subs = await Subscription.find({ userEmail: student.parentEmail });
        if (subs.length === 0) {
          console.warn(`⚠️ لا يوجد اشتراك للبريد "${student.parentEmail}"، سيتم إرسال الإشعار لجميع المشتركين كحل بديل.`);
          await sendPushNotification(
            'تحديث حالة ابنك (بديل)',
            message,
            { url: '/parent-dashboard' },
            null // إرسال للجميع
          );
        }
      } else {
        console.warn(`⚠️ الطالب ${student.name} ليس له بريد ولي أمر، لم يتم إرسال إشعار`);
      }

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

      // إرسال للجميع
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

      // إرسال إشعار لكل ولي أمر
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
