const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// تسجيل مستخدم جديد (ولي أمر أو مدير)
// يجب أن يكون المدير هو من يسجل أولياء الأمور، ولكننا سنترك التسجيل مفتوحاً للتجربة
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
    }

    const user = new User({
      name,
      email,
      password,
      phone,
      role: role || 'parent', // افتراضياً ولي أمر
    });
    await user.save();

    const token = jwt.sign(
      { email: user.email, name: user.name, role: user.role, id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'بريد إلكتروني أو كلمة مرور خاطئة' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'بريد إلكتروني أو كلمة مرور خاطئة' });
    }

    const token = jwt.sign(
      { email: user.email, name: user.name, role: user.role, id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
