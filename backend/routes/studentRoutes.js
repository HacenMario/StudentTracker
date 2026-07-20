const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const auth = require('../middleware/auth'); // سننشئ هذا الملف لاحقاً

// جلب جميع الطلاب المرتبطين بولي الأمر (بناءً على البريد الإلكتروني من التوكن)
router.get('/', auth, async (req, res) => {
  try {
    // req.user تم تعبئته من middleware auth ويحتوي على email
    const students = await Student.find({ parentEmail: req.user.email }).sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إضافة طالب جديد (يتم ربطه تلقائياً بولي الأمر الحالي)
router.post('/', auth, async (req, res) => {
  try {
    const { name, parentName, parentPhone, parentEmail, address } = req.body;
    
    // التأكد من أن البريد المدخل هو نفس بريد ولي الأمر المسجل (أو يمكن تغيير حسب الرغبة)
    if (parentEmail !== req.user.email) {
      return res.status(403).json({ message: 'لا يمكنك إضافة طالب لبريد آخر' });
    }

    const newStudent = new Student({
      name,
      parentName,
      parentPhone,
      parentEmail,
      address: address || '',
    });

    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تبديل حالة الطالب (مع التأكد من أنه يخص ولي الأمر الحالي)
router.put('/:id/toggle', auth, async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, parentEmail: req.user.email });
    if (!student) return res.status(404).json({ message: 'غير موجود أو غير مسموح' });

    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف طالب (مع التأكد من الملكية)
router.delete('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({ _id: req.params.id, parentEmail: req.user.email });
    if (!student) return res.status(404).json({ message: 'غير موجود أو غير مسموح' });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
