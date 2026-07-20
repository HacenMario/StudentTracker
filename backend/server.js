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
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

app.use('/api/students', studentRoutes);

io.on('connection', (socket) => {
  console.log('🟢 عميل جديد متصل');

  socket.on('toggle-status', async (studentId) => {
    try {
      const student = await Student.findById(studentId);
      if (!student) return;

      student.isInside = !student.isInside;
      student.lastUpdate = new Date();
      await student.save();

      // ===== التصحيح هنا =====
      const statusText = student.isInside ? 'داخل 🏫' : 'خارج 🚪';
      const message = 'التلميذ ' + student.name + ' أصبح ' + statusText;
      // =========================

      io.emit('status-changed', {
        student: student,
        message: message
      });
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 عميل غير متصل');
  });
});

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
