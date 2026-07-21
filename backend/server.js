require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');

// استيراد النماذج
const Tenant = require('./models/Tenant');
const User = require('./models/User');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const SchoolSettings = require('./models/SchoolSettings');
const Subscription = require('./models/Subscription');

// استيراد المسارات
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const i18nRoutes = require('./routes/i18nRoutes');

// استيراد دالة الإشعارات
const { sendPushNotificationToAll } = require('./utils/notifications');

// استيراد نظام الترجمات
const i18n = require('./utils/i18n');

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

// Middleware للغة
app.use((req, res, next) => {
  const lang = req.headers['accept-language'] || 'ar';
  req.lang = lang.split(',')[0].split('-')[0];
  req.t = (key) => i18n.translate(req.lang, key);
  next();
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ==========================================
// ✅ Middleware للتحقق من المؤسسة (Tenant) - معدّل
// ==========================================
app.use(async (req, res, next) => {
  // تخطي مسارات المصادقة العامة والترجمات (لا تحتاج مؤسسة)
  const publicPaths = ['/api/auth/', '/api/i18n/', '/api/tenants/'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // استخراج subdomain من الرأس
  const subdomain = req.headers['x-tenant-subdomain'];
  
  // ✅ إذا لم يكن هناك subdomain، نبحث عن tenantId من المستخدم (إن وجد)
  // هذا يسمح بالتوافق مع الإصدار القديم
  if (!subdomain) {
    // إذا كان الطلب يحمل توكن، نحاول استخراج tenantId من المستخدم
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.tenantId) {
          const tenant = await Tenant.findOne({ _id: decoded.tenantId, isActive: true });
          if (tenant) {
            req.tenant = tenant;
            return next();
          }
        }
      } catch (err) {
        // توكن غير صالح، نكمل بدون tenant
      }
    }
    
    // ✅ إذا كان المسار من نوع /api/settings، نسمح بالمرور دون tenant (للتوافق القديم)
    // نبحث عن إعدادات المدرسة في قاعدة البيانات مباشرة (بدون فلتر tenant)
    return next();
  }

  // إذا كان هناك subdomain، نبحث عنه
  try {
    const tenant = await Tenant.findOne({ subdomain, isActive: true });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or inactive' });
    }
    req.tenant = tenant;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تسجيل المسارات
app.use('/api/auth', authRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/tenants', tenantRoutes);

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
  // 1. إشعار عام من المدير
  // ----------------------
  socket.on('admin-notification', async (data) => {
    if (socket.user.role !== 'admin' && socket.user.role !== 'super_admin') {
      socket.emit('error', { message: 'غير مصرح لك' });
      return;
    }

    try {
      const tenant = await Tenant.findOne({ _id: socket.user.tenantId });
      if (!tenant) {
        socket.emit('error', { message: 'المؤسسة غير موجودة' });
        return;
      }

      const notification = new Notification({
        target: 'all',
        message: data.message,
        tenantId: tenant._id,
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
  // 2. إشعار خاص لولي أمر معين
  // ----------------------
  socket.on('admin-notification-to-parent', async (data) => {
    if (socket.user.role !== 'admin' && socket.user.role !== 'super_admin') {
      socket.emit('notification-error', { message: 'غير مصرح لك' });
      return;
    }

    const { parentEmail, message } = data;
    if (!parentEmail || !message) {
      socket.emit('notification-error', { message: 'البريد الإلكتروني والرسالة مطلوبان' });
      return;
    }

    try {
      const tenant = await Tenant.findOne({ _id: socket.user.tenantId });
      if (!tenant) {
        socket.emit('error', { message: 'المؤسسة غير موجودة' });
        return;
      }

      const notification = new Notification({
        target: parentEmail,
        message: message,
        tenantId: tenant._id,
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
    if (socket.user.role !== 'admin' && socket.user.role !== 'super_admin') {
      socket.emit('error', { message: 'غير مصرح لك' });
      return;
    }

    const { newStatus } = data;
    try {
      const tenant = await Tenant.findOne({ _id: socket.user.tenantId });
      if (!tenant) {
        socket.emit('error', { message: 'المؤسسة غير موجودة' });
        return;
      }

      const students = await Student.find({ tenantId: tenant._id });
      const updatedParents = new Set();

      for (const student of students) {
        student.isInside = newStatus;
        student.lastUpdate = new Date();
        await student.save();

        const attendance = new Attendance({
          student: student._id,
          status: newStatus ? 'in' : 'out',
          method: 'manual',
          tenantId: tenant._id,
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
          tenantId: tenant._id,
          sender: 'Admin',
        });
        await notification.save();
      }

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
  
  // إنشاء المدير العام (Super Admin) إذا لم يكن موجوداً
  initializeSuperAdmin();
  
  server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
  });
})
.catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==========================================
// دالة تهيئة المدير العام
// ==========================================
async function initializeSuperAdmin() {
  try {
    // التحقق من وجود مدير عام
    const superAdminExists = await User.findOne({ role: 'super_admin' });
    if (!superAdminExists) {
      // إنشاء مدير عام افتراضي
      const superAdmin = new User({
        name: 'Super Admin',
        email: 'admin@system.com',
        password: '123456',
        phone: '0000000000',
        role: 'super_admin',
        tenantId: null,
        preferences: { language: 'ar' },
      });
      await superAdmin.save();
      console.log('✅ تم إنشاء المدير العام: admin@system.com / Admin@123456');
      
      // إنشاء مؤسسة افتراضية
      const defaultTenant = new Tenant({
        name: 'المدرسة النموذجية',
        subdomain: 'demo',
        address: 'العنوان الافتراضي',
        phone: '0555000000',
        email: 'demo@school.com',
        adminId: superAdmin._id,
      });
      await defaultTenant.save();
      console.log('✅ تم إنشاء المؤسسة الافتراضية: demo');
      
      // تحديث المدير العام ليرتبط بالمؤسسة
      superAdmin.tenantId = defaultTenant._id;
      await superAdmin.save();
    }
  } catch (err) {
    console.error('❌ خطأ في تهيئة المدير العام:', err);
  }
}
