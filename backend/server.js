require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

// استيراد النماذج
const Student = require('./models/Student');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const Setting = require('./models/Setting'); // <-- جديد

// استيراد المسارات
const studentRoutes = require('./routes/studentRoutes');
const authRoutes = require('./routes/authRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingRoutes = require('./routes/settingRoutes'); // <-- جديد

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
app.use(express.json());

// تسجيل المسارات
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingRoutes); // <-- جديد

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

      io.emit('status-changed', {
        student: student,
        message: message,
        parentId: student.parent ? student.parent.toString() : null,
        parentEmail: student.parentEmail,
      });

    } catch (error) {
      console.error(error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير الحالة' });
    }
  });

  // ==========================================
  // 2. تبديل حالة جميع الطلاب (دفعة واحدة)
  // ==========================================
  socket.on('toggle-all-status', async (targetStatus) => {
    if (socket.user.role !== 'admin') {
      socket.emit('error', { message: 'غير مصرح لك' });
      return;
    }

    try {
      // العثور على جميع الطلاب
      const students = await Student.find();
      if (students.length === 0) {
        socket.emit('error', { message: 'لا يوجد طلاب لتغيير حالتهم' });
        return;
      }

      // تحديث حالة كل طالب
      const updates = students.map(async (student) => {
        student.isInside = targetStatus; // true = داخل, false = خارج
        student.lastUpdate = new Date();
        await student.save();

        // تسجيل حضور لكل طالب
        const attendance = new Attendance({
          student: student._id,
          status: targetStatus ? 'in' : 'out',
          method: 'manual',
        });
        await attendance.save();

        const statusText = targetStatus ? 'داخل 🏫' : 'خارج 🚪';
        const message = `التلميذ ${student.name} أصبح ${statusText}`;

        // إرسال إشعار لكل طالب (يمكن تحسينه ليكون إشعاراً واحداً)
        io.emit('status-changed', {
          student: student,
          message: message,
          parentId: student.parent ? student.parent.toString() : null,
          parentEmail: student.parentEmail,
        });
      });

      await Promise.all(updates);

      // إشعار للمدير بنجاح العملية
      socket.emit('toggle-all-done', { message: 'تم تحديث حالة جميع الطلاب بنجاح' });

    } catch (error) {
      console.error(error);
      socket.emit('error', { message: 'حدث خطأ أثناء تغيير حالة جميع الطلاب' });
    }
  });

  // ----------------------
  // 3. إشعار عام من المدير (مع الحفظ في DB)
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

    } catch (err) {
      console.error(err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار العام' });
    }
  });

  // ----------------------
  // 4. إشعار خاص لولي أمر معين (مع الحفظ في DB)
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

    } catch (err) {
      console.error(err);
      socket.emit('notification-error', { message: 'فشل حفظ الإشعار الخاص' });
    }
  });

  // ----------------------
  // 5. انقطاع الاتصال
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
