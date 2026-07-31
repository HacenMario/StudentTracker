require('dotenv').config();

// ✅ ضبط المنطقة الزمنية للخادم إلى الجزائر
process.env.TZ = 'Africa/Algiers';

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const leaveRoutes = require('./routes/leaveRoutes');
const { startSmartAlertScheduler } = require('./services/smartAlertScheduler');
const holidayRoutes = require('./routes/holidayRoutes');

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
const smartAlertRoutes = require('./routes/smartAlertRoutes');

const Holiday = require('./models/Holiday');

const auth = require('./middleware/auth');
const { isAdmin } = require('./middleware/auth');

const { getSchoolDaysInRange } = require('./services/smartAlertScheduler');

// ✅ استيراد خدمة الجدولة للإشعارات المبكرة
const { startNotificationScheduler } = require('./services/notificationScheduler');

const app = express();
const server = http.createServer(app);

// تعريف io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.set('io', io);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: 'https://student-tracker-system.vercel.app' }));

// ✅ Ping لإبقاء الخادم نشطاً
setInterval(() => {
  io.emit('ping', { timestamp: Date.now() });
}, 60000);

// تسجيل المسارات
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/smart-alerts', smartAlertRoutes);
app.use('/api/holidays', holidayRoutes);

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
// دالة إرسال إشعار لولي أمر محدد
// ==========================================
async function sendPushNotificationToParent(title, body, data = {}, parentEmail) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة');
      return;
    }

    if (!parentEmail) {
      console.warn('⚠️ لم يتم تحديد بريد ولي الأمر');
      return;
    }

    const subscriptions = await Subscription.find({ userEmail: parentEmail });
    console.log(`📊 عدد المشتركين للبريد ${parentEmail}: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn(`⚠️ لا يوجد اشتراكات للبريد: ${parentEmail}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data,
      url: data.url || '/parent-dashboard',
    });

    console.log(`📨 جاري إرسال إشعار خاص لـ ${parentEmail}`);

    let successCount = 0;
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ تم إرسال الإشعار إلى مشترك (بريد: ${sub.userEmail})`);
        successCount++;
      } catch (err) {
        console.error(`❌ فشل إرسال الإشعار:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
          console.log(`🗑️ تم حذف اشتراك منتهي`);
        }
      }
    }

    console.log(`✅ انتهى إرسال الإشعار الخاص (نجح ${successCount} من ${subscriptions.length})`);

  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعار الخاص:', err);
  }
}

// ==========================================
// دالة إرسال إشعار لجميع المشتركين (للإشعارات العامة فقط)
// ==========================================
async function sendPushNotificationToAll(title, body, data = {}) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة');
      return;
    }

    const subscriptions = await Subscription.find({});
    console.log(`📊 عدد المشتركين الكلي: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn('⚠️ لا يوجد مشتركين');
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

    console.log(`📨 جاري إرسال الإشعار لـ ${subscriptions.length} مشترك`);

    let successCount = 0;
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ تم إرسال الإشعار إلى مشترك (بريد: ${sub.userEmail || 'غير معروف'})`);
        successCount++;
      } catch (err) {
        console.error(`❌ فشل إرسال الإشعار:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
          console.log(`🗑️ تم حذف اشتراك منتهي`);
        }
      }
    }

    console.log(`✅ انتهى إرسال الإشعارات (نجح ${successCount} من ${subscriptions.length})`);

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

    // ✅ تغيير الحالة بدون طرح ساعة
    student.isInside = !student.isInside;
    student.lastUpdate = new Date(); // الوقت المحلي الصحيح
    await student.save();

    // ✅ تسجيل الحضور بدون طرح ساعة
    const attendance = new Attendance({
      student: student._id,
      status: student.isInside ? 'in' : 'out',
      method: 'manual',
      timestamp: new Date(), // الوقت المحلي الصحيح
    });
    await attendance.save();

    const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
    const message = `التلميذ ${student.name} أصبح ${statusText}`;

    // ... بقية الكود (إرسال الإشعارات) كما هو ...
  } catch (error) {
    console.error('❌ خطأ في تغيير حالة الطالب:', error);
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
        sender: 'Admin',
      });
      await notification.save();

      io.emit('notification', {
        message: data.message,
        notificationId: notification._id,
        createdAt: notification.createdAt,
      });

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
  // 3. إشعار خاص لولي أمر معين
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
        sender: 'Admin',
      });
      await notification.save();

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

      await sendPushNotificationToParent(
        '📩 إشعار خاص من المدرسة',
        message,
        { url: '/parent-dashboard' },
        parentEmail
      );

    } catch (err) {
      console.error('❌ خطأ في إرسال الإشعار الخاص:', err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار الخاص' });
    }
  });

  // ----------------------
  // 4. تغيير حالة جميع الطلاب دفعة واحدة
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

      io.emit('status-changed', {
        message: message,
        isBulk: true,
      });

      for (const email of updatedParents) {
        const notification = new Notification({
          target: email,
          message: message,
          sender: 'Admin',
        });
        await notification.save();

        await sendPushNotificationToParent(
          'تحديث جماعي',
          message,
          { url: '/parent-dashboard' },
          email
        );
      }
    } catch (error) {
      console.error('❌ خطأ في التغيير الجماعي:', error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة الجماعية' });
    }
  });

  socket.on('disconnect', () => {
    userSockets.delete(userEmail);
    console.log(`🔴 عميل غير متصل: ${userEmail}`);
  });
});

// ==========================================
// مسار للتحقق من صحة الخادم
// ==========================================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: '🚀 Student Tracker API is running',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// ✅ مسار اختبار الإشعارات المبكرة (للتجربة اليدوية)
// ==========================================
app.get('/api/test-leaving', async (req, res) => {
  try {
    const settings = await SchoolSettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: 'لا توجد إعدادات' });
    }

    const students = await Student.find({ isInside: true });
    if (students.length === 0) {
      return res.json({ message: '📭 لا يوجد طلاب داخل المدرسة' });
    }

    const notifyMinutesBefore = settings.notificationBeforeMinutes || 30;
    let sentCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const message = `🧪 اختبار: باقي ${notifyMinutesBefore} دقيقة على خروج ${student.name} من المدرسة`;

      await new Notification({
        target: student.parentEmail,
        message: message,
        sender: 'System',
      }).save();

      await sendPushNotificationToParent(
        '🧪 تنبيه خروج (اختبار)',
        message,
        { url: '/parent-dashboard' },
        student.parentEmail
      );
      sentCount++;
    }

    res.json({ message: `✅ تم إرسال ${sentCount} إشعار اختبار بنجاح` });
  } catch (err) {
    console.error('❌ خطأ في اختبار الإشعارات:', err);
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// ✅ مسار الإشعارات المبكرة الفعلي (للتشغيل التلقائي)
// ==========================================
app.get('/api/trigger-leaving', async (req, res) => {
  try {
    const settings = await SchoolSettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: 'لا توجد إعدادات' });
    }

    const students = await Student.find({ isInside: true });
    if (students.length === 0) {
      return res.json({ message: '📭 لا يوجد طلاب داخل المدرسة' });
    }

    const notifyMinutesBefore = settings.notificationBeforeMinutes || 30;
    let sentCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

const messageAr = `⏰ تنبيه: باقي ${notifyMinutesBefore} دقيقة على خروج ${student.name} من المدرسة`;
const messageFr = `⏰ Alerte : il reste ${notifyMinutesBefore} minutes avant la sortie de ${student.name} de l'école`;
      
      await new Notification({
        target: student.parentEmail,
        message: message,
        sender: 'System',
      }).save();

await sendPushNotificationToParent(
  '⏰ تنبيه الخروج',
  messageAr,
  { url: '/parent-dashboard' },
  student.parentEmail
);
      sentCount++;
    }

    console.log(`✅ تم إرسال ${sentCount} إشعار خروج مبكر بنجاح`);
    res.json({ message: `✅ تم إرسال ${sentCount} إشعار خروج مبكر بنجاح` });
  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعارات المبكرة:', err);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/test-holidays', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
    
    // ✅ استخدام الدالة المحسّنة
    const schoolDays = await getSchoolDaysInRange(startDate, today);
    
    // ✅ جلب العطل في النطاق مع عرض endDate
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: today },
      isActive: true
    });
    
    res.json({
      totalDays: 30,
      schoolDays: schoolDays.length,
      holidays: holidays.map(h => ({
        name: h.name,
        date: new Date(h.date).toISOString().split('T')[0],
        endDate: h.endDate ? new Date(h.endDate).toISOString().split('T')[0] : null
      })),
      message: `✅ تم استثناء ${holidays.length} يوم عطلة من أصل 30 يوم`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
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
  
  // ✅ بدء خدمة الجدولة للإشعارات التلقائية
  startNotificationScheduler();

  // ✅ بدء خدمة التنبيهات الذكية
startSmartAlertScheduler()
  
  server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
  });
})
.catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));
