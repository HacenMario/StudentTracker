const express = require('express');
const router = express.Router();
const Holiday = require('../models/Holiday');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');

// ==========================================
// 1. جلب جميع العطل
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 2. جلب العطل في فترة زمنية معينة
// ==========================================
router.get('/range', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: 'يجب تحديد تاريخ البداية والنهاية' });
    }
    
    const holidays = await Holiday.find({
      date: { $gte: new Date(start), $lte: new Date(end) },
    });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 3. إضافة عطلة جديدة (للمدير فقط)
// ==========================================
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const { date, name, description, isRecurring } = req.body;
    
    if (!date || !name) {
      return res.status(400).json({ message: 'التاريخ والاسم مطلوبان' });
    }
    
    // التحقق من عدم وجود عطلة في نفس التاريخ
    const existing = await Holiday.findOne({ date: new Date(date) });
    if (existing) {
      return res.status(400).json({ message: 'يوجد عطلة في هذا التاريخ بالفعل' });
    }
    
    const holiday = new Holiday({
      date: new Date(date),
      name,
      description: description || '',
      isRecurring: isRecurring || false,
    });
    
    await holiday.save();
    res.status(201).json({ success: true, message: '✅ تم إضافة العطلة بنجاح', holiday });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 4. حذف عطلة (للمدير فقط)
// ==========================================
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await Holiday.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '✅ تم حذف العطلة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
