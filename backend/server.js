require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const studentRoutes = require('./routes/studentRoutes');
const authRoutes = require('./routes/authRoutes');
const Student = require('./models/Student');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // استبدل برابط Vercel في الإنتاج
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

// مسارات المصادقة
app.use('/api/auth', authRoutes);
// مسارات الطلاب (محمية بـ auth)
app.use('/api/students', studentRoutes);

// ==========================================
// Socket.io مع التحقق من التوكن
// ==========================================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // حفظ معلومات المستخدم في الـ socket
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log('🟢 عميل متصل:', socket.user.email);

  socket.on('toggle-status', async (studentId) => {
    try {
      // التأكد من أن الطالب يخص هذا المستخدم
      const student = await Student.findOne({ _id: studentId, parentEmail: socket.user.email });
      if (!student) return;

      student.isInside = !student.isInside;
      student.lastUpdate = new Date();
      await student.save();

      // إرسال التحديث لجميع العملاء (أو يمكن تخصيصه للآباء المرتبطين)
      const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
      const message = `التلميذ ${student.name} أصبح ${statusText}`;

      io.emit('status-changed', {
        student: student,
        message: message,
        parentEmail: student.parentEmail // يمكن استخدامه للتصفية لاحقاً
      });
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 عميل غير متصل:', socket.user.email);
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
