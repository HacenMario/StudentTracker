const express = require('express');
const router = express.Router();
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { runAllSmartAlerts } = require('../services/smartAlertScheduler');

// ==========================================
// 1. جلب التنبيهات (للمدير أو ولي الأمر)
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'parent') {
      query.parentEmail = req.user.email;
    }
    const alerts = await SmartAlert.find(query)
      .populate('student', 'name parentName')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 2. تحديث حالة التنبيه إلى "مقروء"
// ==========================================
router.put('/:id/read', auth, async (req, res) => {
  try {
    const alert = await SmartAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'التنبيه غير موجود' });
    
    if (req.user.role === 'parent' && alert.parentEmail !== req.user.email) {
      return res.status(403).json({ message: 'غير مصرح لك' });
    }
    
    alert.isRead = true;
    await alert.save();
    res.json({ success: true, message: 'تم تحديث التنبيه كمقروء' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 3. جلب قواعد التنبيهات (للمدير فقط)
// ==========================================
router.get('/rules', auth, isAdmin, async (req, res) => {
  try {
    const rules = await AlertRule.find();
    if (rules.length === 0) {
      // إنشاء قواعد افتراضية
      const defaultRules = [
        { type: 'absence', conditions: { absenceConsecutiveDays: 3, absenceMonthlyDays: 5 }, cooldownDays: 7 },
        { type: 'tardiness', conditions: { tardinessPerWeek: 3 }, cooldownDays: 7 },
        { type: 'achievement', conditions: { achievementConsecutiveDays: 10, achievementMonthlyDays: 20 }, cooldownDays: 14 },
      ];
      await AlertRule.insertMany(defaultRules);
      const updatedRules = await AlertRule.find();
      return res.json(updatedRules);
    }
    res.json(rules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 4. تحديث قواعد التنبيهات (للمدير فقط)
// ==========================================
router.put('/rules/:type', auth, isAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const { enabled, conditions, cooldownDays } = req.body;
    
    const rule = await AlertRule.findOne({ type });
    if (!rule) {
      return res.status(404).json({ message: 'القاعدة غير موجودة' });
    }
    
    if (enabled !== undefined) rule.enabled = enabled;
    if (conditions) {
      Object.keys(conditions).forEach(key => {
        rule.conditions[key] = conditions[key];
      });
    }
    if (cooldownDays !== undefined) rule.cooldownDays = cooldownDays;
    rule.updatedAt = new Date();
    
    await rule.save();
    res.json({ success: true, message: 'تم تحديث القاعدة بنجاح', rule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================================
// 5. تشغيل التنبيهات يدوياً (للمدير فقط)
// ==========================================
router.post('/run', auth, isAdmin, async (req, res) => {
  try {
    await runAllSmartAlerts();
    res.json({ success: true, message: 'تم تشغيل جميع التنبيهات الذكية بنجاح' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
