const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

// جلب جميع الطلاب
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إضافة طالب جديد
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'الاسم مطلوب' });
    
    const existing = await Student.findOne({ name: { $regex: new RegExp('^' + name + '$', 'i') } });
    if (existing) return res.status(400).json({ message: 'الطالب موجود مسبقاً' });

    const newStudent = new Student({ name });
    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تبديل حالة الطالب (داخل/خارج)
router.put('/:id/toggle', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    student.isInside = !student.isInside;
    student.lastUpdate = new Date();
    await student.save();

    // سنرسل حدث عبر Socket.io من داخل server.js، لكننا سنعيد البيانات هنا
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف طالب
router.delete('/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;﻿
