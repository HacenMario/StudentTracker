const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

// GET - جلب جميع الطلاب
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST - إضافة طالب جديد مع جميع الحقول
router.post('/', async (req, res) => {
  try {
    const { name, parentName, phone, address, email } = req.body;
    if (!name || !parentName || !phone || !address || !email) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    // التحقق من عدم تكرار البريد أو الهاتف
    const existing = await Student.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({ message: 'البريد أو الهاتف موجود مسبقاً' });
    }

    // إنشاء studentId تلقائي
    const count = await Student.countDocuments();
    const studentId = `STU-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const newStudent = new Student({
      studentId,
      name,
      parentName,
      phone,
      address,
      email,
    });

    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT - تبديل الحالة (نفسه سابقاً)
router.put('/:id/toggle', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE - حذف طالب
router.delete('/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
