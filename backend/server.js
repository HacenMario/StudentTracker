require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const studentRoutes = require('./routes/studentRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// جعل io متاحاً في req.app للاستخدام في Routes
app.set('io', io);

app.use(cors());
app.use(express.json());

// مسارات المصادقة
app.use('/api/auth', authRoutes);
// مسارات الطلاب (محمية)
app.use('/api/students', studentRoutes);

// ==========================================
// Socket.io مع التحقق من التوكن وتخزين المستخدمين
// ==========================================
const userSockets = new Map(); // تخزين socket.id لكل مستخدم (بالبريد الإلكتروني)

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
  // 1. تبديل حالة الطالب (يستمع له المدير)
  // ----------------------
  socket.on('toggle-status', async (studentId) => {
    // التأكد من أن المرسل هو مدير
    if (socket.user.role !== 'admin') {
      socket.emit('error', { message: 'غير مصرح لك بتغيير الحالة' });
      return;
    }

    try {
      const Student = require('./models/Student');
      const Attendance = require('./models/Attendance');
      const student = await Student.findById(studentId);
      if (!student) {
        socket.emit('error', { message: 'الطالب غير موجود' });
        return;
      }

      // تغيير الحالة
      student.isInside = !student.isInside;
      student.lastUpdate = new Date();
      await student.save();

      // تسجيل في سجل الحضور
      const attendance = new Attendance({
        student: student._id,
        status: student.isInside ? 'in' : 'out',
        method: 'manual',
      });
      await attendance.save();

      // إرسال التحديث لجميع العملاء (بما في ذلك أولياء الأمور)
      const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
      const message = `التلميذ ${student.name} أصبح ${statusText}`;
      
      // بث عام
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

  // ----------------------
  // 2. إشعار عام من المدير لجميع أولياء الأمور
  // ----------------------
  socket.on('admin-notification', (data) => {
    if (socket.user.role !== 'admin') return;
    io.emit('notification', { message: data.message });
  });

  // ----------------------
  // 3. إشعار خاص لولي أمر معين (بالبريد الإلكتروني)
  // ----------------------
  socket.on('admin-notification-to-parent', (data) => {
    if (socket.user.role !== 'admin') {
      socket.emit('notification-error', { message: 'غير مصرح لك' });
      return;
    }
    const { parentEmail, message } = data;
    if (!parentEmail || !message) {
      socket.emit('notification-error', { message: 'البريد الإلكتروني والرسالة مطلوبان' });
      return;
    }

    const targetSocketId = userSockets.get(parentEmail);
    if (targetSocketId) {
      io.to(targetSocketId).emit('notification', { message });
      socket.emit('notification-sent', { parentEmail, message });
    } else {
      socket.emit('notification-error', { message: `ولي الأمر (${parentEmail}) غير متصل حالياً` });
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
