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
    const { date, endDate, name, description, isRecurring } = req.body;
    
    if (!date || !name) {
      return res.status(400).json({ message: 'التاريخ والاسم مطلوبان' });
    }
    
    // ✅ التحقق من عدم وجود عطلة تتداخل مع التاريخ
    const start = new Date(date);
    const end = endDate ? new Date(endDate) : new Date(date);
    
    const existing = await Holiday.findOne({
      $or: [
        { date: { $gte: start, $lte: end } },
        { endDate: { $gte: start, $lte: end } },
        { date: { $lte: start }, endDate: { $gte: start } }
      ]
    });
    
    if (existing) {
      return res.status(400).json({ message: 'يوجد عطلة تتداخل مع هذا التاريخ' });
    }
    
    const holiday = new Holiday({
      date: start,
      endDate: endDate ? new Date(endDate) : null,
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

// ==========================================
// 5. تبديل حالة العطلة (تفعيل/تعطيل) - للمدير فقط
// ==========================================
router.put('/:id/toggle', auth, isAdmin, async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'العطلة غير موجودة' });
    }
    
    holiday.isActive = holiday.isActive === false ? true : false;
    await holiday.save();
    
    const statusText = holiday.isActive ? 'تفعيل' : 'تعطيل';
    res.json({ 
      success: true, 
      message: `✅ تم ${statusText} العطلة بنجاح`,
      holiday 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 6. تعديل عطلة (للمدير فقط)
// ==========================================
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { date, endDate, name, description } = req.body;
    const holiday = await Holiday.findById(req.params.id);
    
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'العطلة غير موجودة' });
    }
    
    if (date) holiday.date = new Date(date);
    if (endDate) holiday.endDate = new Date(endDate);
    else if (endDate === null) holiday.endDate = null;
    if (name) holiday.name = name;
    if (description !== undefined) holiday.description = description;
    
    await holiday.save();
    res.json({ success: true, message: '✅ تم تعديل العطلة بنجاح', holiday });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;
