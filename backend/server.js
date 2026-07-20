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
// Socket.io مع التحقق من التوكن
// ==========================================
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

socket.on('admin-notification', (data) => {
  // data: { message, targetParentEmail? }
  if (socket.user.role === 'admin') {
    if (data.targetParentEmail) {
      // إرسال فقط لولي الأمر المستهدف
      io.to(data.targetParentEmail).emit('notification', { message: data.message });
    } else {
      // إرسال للجميع
      io.emit('notification', { message: data.message });
    }
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
