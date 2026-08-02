// backend/server.js
// ==========================================
// الخادم الرئيسي - النسخة المترجمة الكاملة
// تحتوي على جميع الوظائف من كلا الملفين مع دعم الترجمة الكامل
// ==========================================

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

// استيراد المسارات
const leaveRoutes = require('./routes/leaveRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const parentRoutes = require('./routes/parent');
const studentRoutes = require('./routes/studentRoutes');
const authRoutes = require('./routes/authRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const smartAlertRoutes = require('./routes/smartAlertRoutes');

// استيراد النماذج
const Student = require('./models/Student');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const SchoolSettings = require('./models/SchoolSettings');
const Subscription = require('./models/Subscription');
const Holiday = require('./models/Holiday');

// استيراد الـ middleware والخدمات
const auth = require('./middleware/auth');
const { isAdmin } = require('./middleware/auth');
const { getSchoolDaysInRange } = require('./services/smartAlertScheduler');
const { startNotificationScheduler } = require('./services/notificationScheduler');
const { startSmartAlertScheduler } = require('./services/smartAlertScheduler');

// ✅ استيراد نظام الترجمة
const { translate, detectUserLang } = require('./utils/i18n');

const app = express();
const server = http.createServer(app);

// تعريف io
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.set('io', io);
app.use(cors({ origin: 'https://student-tracker-system.vercel.app' }));
app.use(express.json({ limit: '5mb' }));

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
app.use('/api/parent', parentRoutes);

// ==========================================
// إعداد Web Push (VAPID)
// ==========================================
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  console.warn('⚠️ VAPID keys not found in .env — push notifications will not work');
} else {
  webpush.setVapidDetails('mailto:info@school.edu', vapidKeys.publicKey, vapidKeys.privateKey);
  console.log('✅ VAPID configured for push notifications');
}

// ==========================================
// دالة إرسال إشعار لولي أمر محدد (مع ترجمة)
// ==========================================
async function sendPushNotificationToParent(title, body, data = {}, parentEmail) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ VAPID keys not available');
      return;
    }

    if (!parentEmail) {
      console.warn('⚠️ Parent email not specified');
      return;
    }

    const subscriptions = await Subscription.find({ userEmail: parentEmail });
    console.log(`📊 Subscriptions for ${parentEmail}: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn(`⚠️ No subscriptions for: ${parentEmail}`);
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

    console.log(`📨 Sending push notification to ${parentEmail}`);

    let successCount = 0;
    for (const sub of subscriptions) {
      try {
        const pushSubscription = { endpoint: sub.endpoint, keys: sub.keys };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ Push sent to subscriber (email: ${sub.userEmail})`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to send push:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
          console.log(`🗑️ Expired subscription removed`);
        }
      }
    }

    console.log(`✅ Push dispatch complete (${successCount}/${subscriptions.length} succeeded)`);
  } catch (err) {
    console.error('❌ Error sending push notification:', err);
  }
}

// ==========================================
// دالة إرسال إشعار لجميع المشتركين (للإشعارات العامة فقط)
// ==========================================
async function sendPushNotificationToAll(title, body, data = {}) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ VAPID keys not available');
      return;
    }

    const subscriptions = await Subscription.find({});
    console.log(`📊 Total subscriptions: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn('⚠️ No subscribers');
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

    console.log(`📨 Sending push to ${subscriptions.length} subscriber(s)`);

    let successCount = 0;
    for (const sub of subscriptions) {
      try {
        const pushSubscription = { endpoint: sub.endpoint, keys: sub.keys };
        await webpush.sendNotification(pushSubscription, payload);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to send push:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
        }
      }
    }

    console.log(`✅ Push dispatch complete (${successCount}/${subscriptions.length} succeeded)`);
  } catch (err) {
    console.error('❌ Error sending push notifications:', err);
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
  console.log(`🟢 Client connected: ${userEmail} (role: ${socket.user.role})`);

  // ----------------------
  // 1. تبديل حالة الطالب (للمدير) - مع ترجمة
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

      // ✅ جلب لغة ولي الأمر
      let lang = 'ar';
      if (student.parentEmail) {
        const parentUser = await User.findOne({ email: student.parentEmail });
        lang = detectUserLang(parentUser, null);
      }

      const now = new Date();
      student.isInside = !student.isInside;
      student.lastUpdate = now;
      await student.save();

      const attendance = new Attendance({
        student: student._id,
        status: student.isInside ? 'in' : 'out',
        method: 'manual',
        timestamp: now,
      });
      await attendance.save();

      const statusText = student.isInside
        ? translate(lang, 'attendance.status_inside')
        : translate(lang, 'attendance.status_outside');

      const message = translate(lang, 'attendance.student_became', { name: student.name, status: statusText });

      // ✅ إرسال push notification بلغة ولي الأمر
      if (student.parentEmail) {
        await sendPushNotificationToParent(
          translate(lang, 'webpush.status_title'),
          message,
          { name: student.name, status: statusText, url: '/parent-dashboard' },
          student.parentEmail,
        );

        const notification = new Notification({
          target: student.parentEmail,
          message: message,
          sender: 'Admin',
        });
        await notification.save();

        const targetSocketId = userSockets.get(student.parentEmail);
        if (targetSocketId) {
          io.to(targetSocketId).emit('notification', {
            message: message,
            notificationId: notification._id,
            createdAt: notification.createdAt,
          });
        }
      }

      io.emit('status-changed', {
        student: student,
        parentEmail: student.parentEmail,
        parentId: student.parentId,
      });

      console.log(`✅ Status changed: ${student.name} → ${statusText}`);
    } catch (error) {
      console.error('❌ Error toggling student status:', error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة' });
    }
  });

  // ----------------------
  // 2. إشعار عام من المدير - مع ترجمة
  // ----------------------
  socket.on('admin-notification', async (data) => {
    if (socket.user.role !== 'admin') return;

    const lang = detectUserLang(null, null);

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
        translate(lang, 'webpush.general'),
        data.message,
        { url: '/' },
      );

      console.log(`📢 General notification sent: ${data.message}`);
    } catch (err) {
      console.error('❌ Error sending general notification:', err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار العام' });
    }
  });

  // ----------------------
  // 3. إشعار خاص لولي أمر معين - مع ترجمة
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

    // ✅ جلب لغة ولي الأمر
    let lang = 'ar';
    const parentUser = await User.findOne({ email: parentEmail });
    if (parentUser) {
      lang = detectUserLang(parentUser, null);
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
        socket.emit('notification-sent', { parentEmail, message: message + ' (sent instantly)' });
      } else {
        socket.emit('notification-sent', {
          parentEmail,
          message: message + ' (saved — will appear on login)',
        });
      }

      await sendPushNotificationToParent(
        translate(lang, 'push.private_title'),
        message,
        { url: '/parent-dashboard' },
        parentEmail,
      );
    } catch (err) {
      console.error('❌ Error sending private notification:', err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار الخاص' });
    }
  });

  // ----------------------
  // 4. تغيير حالة جميع الطلاب دفعة واحدة - مع ترجمة
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

      const now = new Date();
      now.setHours(now.getHours() - 1);

      for (const student of students) {
        student.isInside = newStatus;
        student.lastUpdate = now;
        await student.save();

        const attendance = new Attendance({
          student: student._id,
          status: newStatus ? 'in' : 'out',
          method: 'manual',
          timestamp: now,
        });
        await attendance.save();

        if (student.parentEmail) updatedParents.add(student.parentEmail);
      }

      // ✅ رسالة موحدة بالعربية (لأنها تشمل الجميع)
      const message = newStatus
        ? 'تم تغيير حالة جميع الطلاب إلى داخل 🏫'
        : 'تم تغيير حالة جميع الطلاب إلى خارج 🚪';

      io.emit('status-changed', { message, isBulk: true });

      for (const email of updatedParents) {
        // جلب لغة كل ولي أمر
        let lang = 'ar';
        const parentUser = await User.findOne({ email });
        if (parentUser) {
          lang = detectUserLang(parentUser, null);
        }

        const localizedMessage = newStatus
          ? translate(lang, 'attendance.all_inside')
          : translate(lang, 'attendance.all_outside');

        const notification = new Notification({
          target: email,
          message: localizedMessage,
          sender: 'Admin',
        });
        await notification.save();

        await sendPushNotificationToParent(
          translate(lang, 'push.bulk_title'),
          localizedMessage,
          { url: '/parent-dashboard' },
          email,
        );
      }

      socket.emit('toggle-all-done', { success: true });
    } catch (error) {
      console.error('❌ Error in bulk toggle:', error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة الجماعية' });
    }
  });

  socket.on('disconnect', () => {
    userSockets.delete(userEmail);
    console.log(`🔴 Client disconnected: ${userEmail}`);
  });
});

// ==========================================
// نقاط نهاية ولي الأمر (للرسائل) - مع ترجمة
// ==========================================

app.get('/api/parent/my-children', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('students');
    if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });
    if (user.role !== 'parent') return res.status(403).json({ msg: 'غير مصرح لك' });
    res.json(user.students);
  } catch (err) {
    console.error('❌ Error fetching parent children:', err);
    res.status(500).json({ msg: 'خطأ في الخادم' });
  }
});

app.post('/api/parent/send-message', auth, async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ msg: 'غير مصرح لك بإرسال رسائل' });
    }

    const { studentId, subject, message } = req.body;
    if (!studentId || !message) {
      return res.status(400).json({ msg: 'الرجاء تحديد الطالب ونص الرسالة' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ msg: 'الطالب غير موجود' });
    if (student.parent.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'هذا الطالب ليس تابعاً لك' });
    }

    const lang = detectUserLang(req.user, req);

    const newNotification = new Notification({
      sender: req.user.name,
      target: 'admin',
      subject: subject || 'رسالة من ولي أمر',
      message: `رسالة من ولي أمر الطالب (${student.name}): ${message}`,
      senderRole: 'parent',
      parentStudentId: studentId,
    });
    await newNotification.save();

    // إرسال إشعار فوري للمديرين المتصلين
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      const adminSocketId = userSockets.get(admin.email);
      if (adminSocketId) {
        const notifMsg = translate(lang, 'parent.message_notification', {
          parent: req.user.name,
          student: student.name,
        });
        io.to(adminSocketId).emit('notification', {
          message: notifMsg,
          notificationId: newNotification._id,
          createdAt: newNotification.createdAt,
        });
      }
    }

    res.json({ msg: 'تم إرسال رسالتك إلى المدرسة بنجاح' });
  } catch (err) {
    console.error('❌ Error sending parent message:', err);
    res.status(500).json({ msg: 'خطأ في الخادم' });
  }
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
// مسار اختبار الإشعارات المبكرة (مع ترجمة)
// ==========================================
app.get('/api/test-leaving', auth, async (req, res) => {
  try {
    const settings = await SchoolSettings.findOne();
    if (!settings) return res.status(404).json({ message: 'No school settings found' });

    const students = await Student.find({ isInside: true }).populate('parent');
    if (students.length === 0) {
      return res.json({ message: '📭 No students currently inside school' });
    }

    const notifyMinutesBefore = settings.notificationBeforeMinutes || 30;
    let sentCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const lang =
        student.parent && student.parent.preferences && student.parent.preferences.language
          ? student.parent.preferences.language
          : 'ar';

      const title = translate(lang, 'push.test_title');
      const body = translate(lang, 'push.leaving_body', {
        minutes: notifyMinutesBefore,
        studentName: student.name,
      });

      await new Notification({
        target: student.parentEmail,
        message: `🧪 ${body}`,
        sender: translate(lang, 'system.sender'),
      }).save();

      await sendPushNotificationToParent(title, body, { url: '/parent-dashboard' }, student.parentEmail);
      sentCount++;
    }

    res.json({ message: `✅ Sent ${sentCount} test notification(s)` });
  } catch (err) {
    console.error('❌ Error in test leaving:', err);
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// مسار الإشعارات المبكرة الفعلي (للتشغيل التلقائي) - مع ترجمة
// ==========================================
app.get('/api/trigger-leaving', auth, async (req, res) => {
  try {
    const settings = await SchoolSettings.findOne();
    if (!settings) return res.status(404).json({ message: 'No school settings found' });

    const students = await Student.find({ isInside: true }).populate('parent');
    if (students.length === 0) {
      return res.json({ message: '📭 No students currently inside school' });
    }

    const notifyMinutesBefore = settings.notificationBeforeMinutes || 30;
    let sentCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const lang =
        student.parent && student.parent.preferences && student.parent.preferences.language
          ? student.parent.preferences.language
          : 'ar';

      const title = translate(lang, 'push.leaving_title');
      const body = translate(lang, 'push.leaving_body', {
        minutes: notifyMinutesBefore,
        studentName: student.name,
      });

      await new Notification({
        target: student.parentEmail,
        message: `⏰ ${body}`,
        sender: translate(lang, 'system.sender'),
      }).save();

      await sendPushNotificationToParent(title, body, { url: '/parent-dashboard' }, student.parentEmail);
      sentCount++;
    }

    console.log(`✅ Sent ${sentCount} leaving notification(s)`);
    res.json({ message: `✅ Sent ${sentCount} leaving notification(s)` });
  } catch (err) {
    console.error('❌ Error in trigger leaving:', err);
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// مسار اختبار العطل (مع ترجمة - اختياري)
// ==========================================
app.get('/api/test-holidays', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);

    const schoolDays = await getSchoolDaysInRange(startDate, today);

    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: today },
      isActive: true,
    });

    res.json({
      totalDays: 30,
      schoolDays: schoolDays.length,
      holidays: holidays.map((h) => ({
        name: h.name,
        date: new Date(h.date).toISOString().split('T')[0],
        endDate: h.endDate ? new Date(h.endDate).toISOString().split('T')[0] : null,
      })),
      message: `✅ Excluded ${holidays.length} holiday day(s) out of 30 days`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// الاتصال بقاعدة البيانات وبدء الخادم
// ==========================================
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');

    startNotificationScheduler();
    startSmartAlertScheduler();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));
