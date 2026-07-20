require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const studentRoutes = require('./routes/studentRoutes');
const Student = require('./models/Student');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // في الإنتاج، استبدل برابط Vercel الخاص بك
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// ربط Routes
app.use('/api/students', studentRoutes);

// ==========================================
// إعداد Socket.io للإشعارات اللحظية
// ==========================================
io.on('connection', (socket) => {
  console.log('🟢 عميل جديد متصل');

  socket.on('toggle-status', async (studentId) => {
    try {
      const student = await Student.findById(studentId);
      if (!student) return;

      student.isInside = !student.isInside;
      student.lastUpdate = new Date();
      await student.save();

      io.emit('status-changed', {
        student: student,
        message: التلميذ  أصبح 
      });
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 عميل غير متصل');
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
    console.log(🚀 الخادم يعمل على http://localhost:);
  });
})
.catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));
