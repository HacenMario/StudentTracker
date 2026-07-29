const express = require('express');
const router = express.Router();
const LeaveRequest = require('../models/LeaveRequest');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');

// ==========================================
// 1. تقديم طلب عذر غياب (ولي الأمر)
// ==========================================
router.post('/', auth, async (req, res) => {
  try {
    const { studentId, date, reason, fileUrl, fileName } = req.body;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'الطالب غير موجود' });
    }
    if (req.user.role === 'parent' && student.parentEmail !== req.user.email) {
      return res.status(403).json({ message: 'غير مصرح لك' });
    }

    // ✅ تصحيح التاريخ
    let correctedDate = new Date(date);
    if (!isNaN(correctedDate.getTime())) {
      correctedDate = new Date(correctedDate.getTime() + (60 * 60 * 1000));
    }

    const leaveRequest = new LeaveRequest({
      student: studentId,
      parentEmail: req.user.email,
      date: correctedDate || new Date(),
      reason,
      fileUrl: fileUrl || '',
      fileName: fileName || '',
    });

    await leaveRequest.save();

    const io = req.app.get('io');
    io.emit('new-leave-request', {
      message: `📩 طلب عذر غياب جديد من ${student.name}`,
      requestId: leaveRequest._id,
    });

    res.status(201).json({ 
      success: true, 
      message: '✅ تم تقديم طلب العذر بنجاح', 
      leaveRequest 
    });
  } catch (err) {
    console.error('❌ خطأ في تقديم طلب العذر:', err);
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 2. جلب طلبات الإجازات
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'parent') {
      query.parentEmail = req.user.email;
    }
    const requests = await LeaveRequest.find(query)
      .populate('student', 'name parentName')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 3. الموافقة/الرفض (للمدير فقط) - ✅ مُصلح
// ==========================================
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const leaveRequest = await LeaveRequest.findById(req.params.id).populate('student');
    if (!leaveRequest) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    // ✅ إذا كانت الموافقة، نحاول تسجيل Attendance
    if (status === 'approved') {
      try {
        const attendance = new Attendance({
          student: leaveRequest.student._id,
          status: 'excused', // ✅ استخدام 'excused' بدلاً من 'out'
          method: 'leave', // ✅ الآن مقبول لأننا أضفناه في enum
          timestamp: leaveRequest.date || new Date(),
        });
        await attendance.save();
      } catch (attendanceError) {
        console.error('❌ خطأ في تسجيل الحضور:', attendanceError);
        return res.status(400).json({ 
          success: false, 
          message: 'فشل تسجيل الحضور: ' + attendanceError.message 
        });
      }
    }

    // ✅ تحديث حالة الطلب
    leaveRequest.status = status;
    leaveRequest.adminNote = adminNote || '';
    await leaveRequest.save();

    // ✅ إرسال إشعار لولي الأمر
    const io = req.app.get('io');
    const statusText = status === 'approved' ? 'تمت الموافقة ✅' : 'تم الرفض ❌';
    const notificationMessage = `📩 طلب عذر ${leaveRequest.student.name}: ${statusText}`;
    
    // حفظ الإشعار في قاعدة البيانات
    const notification = new Notification({
      target: leaveRequest.parentEmail,
      message: notificationMessage,
      sender: 'Admin',
    });
    await notification.save();

    // إرسال عبر Socket
    io.emit('leave-request-updated', {
      message: notificationMessage,
      requestId: leaveRequest._id,
      parentEmail: leaveRequest.parentEmail,
    });

    res.json({ 
      success: true, 
      message: `✅ تم ${status === 'approved' ? 'الموافقة' : 'الرفض'} على الطلب`, 
      leaveRequest 
    });
  } catch (err) {
    console.error('❌ خطأ في تحديث طلب العذر:', err);
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 4. حذف طلب (للمدير فقط)
// ==========================================
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await LeaveRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '✅ تم حذف الطلب' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 5. عرض الملف المرفق (الصورة أو PDF)
// ==========================================
router.get('/file/:id', auth, async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }
    
    // التحقق من الصلاحية: ولي الأمر يرى ملفه فقط، المدير يرى الكل
    if (req.user.role === 'parent' && leaveRequest.parentEmail !== req.user.email) {
      return res.status(403).json({ message: 'غير مصرح لك' });
    }

    if (!leaveRequest.fileUrl) {
      return res.status(404).json({ message: 'لا يوجد ملف مرفق' });
    }

    // إعادة التوجيه إلى الرابط أو عرض الملف مباشرة
    res.redirect(leaveRequest.fileUrl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
