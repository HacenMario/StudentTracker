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
    const { name, parentName, phone, address, email } = req.body;
    if (!name || !parentName || !phone || !address || !email) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    // التحقق من عدم تكرار البريد أو الهاتف
    const existing = await Student.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({ message: 'البريد الإلكتروني أو رقم الهاتف موجود مسبقاً' });
    }

    // إنشاء studentId فريد (مثال: STU-2026-001)
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
