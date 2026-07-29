const cron = require('node-cron');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const { sendPushNotificationToParent } = require('../utils/notifications');

// ==========================================
// دالة مساعدة: جلب أيام الأسبوع الماضية
// ==========================================
function getLastWeekDates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dates.push(new Date(d));
  }
  return dates;
}

function getMonthDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

// ==========================================
// دالة مساعدة: حساب تاريخ بداية فترة التبريد
// ==========================================
function getCooldownStartDate(cooldownDays) {
  const date = new Date();
  date.setDate(date.getDate() - cooldownDays);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ==========================================
// 1️⃣ تنبيهات الغياب المتكرر
// ==========================================
async function checkAbsenceAlerts() {
  console.log('📊 [غياب] بدء تحليل الغياب المتكرر...');
  
  try {
    const rule = await AlertRule.findOne({ type: 'absence' });
    if (!rule || !rule.enabled) {
      console.log('⏸️ [غياب] التنبيهات معطلة');
      return;
    }

    const { absenceConsecutiveDays, absenceMonthlyDays, cooldownDays } = rule.conditions || { absenceConsecutiveDays: 3, absenceMonthlyDays: 5, cooldownDays: 7 };

    const students = await Student.find();
    let alertCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      // ✅ التحقق من فترة التبريد (باستخدام تاريخ صحيح)
      const cooldownDate = getCooldownStartDate(cooldownDays || 7);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'absence',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

      // 1. الغياب المتتالي
      let consecutiveAbsences = 0;
      let currentStreak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const attendance = await Attendance.findOne({
          student: student._id,
          timestamp: { $gte: date, $lt: nextDate },
        });

        if (!attendance || attendance.status === 'excused') {
          currentStreak++;
          if (currentStreak > consecutiveAbsences) {
            consecutiveAbsences = currentStreak;
          }
        } else {
          currentStreak = 0;
        }
      }

      // 2. الغياب الشهري
      const monthDates = getMonthDates();
      let monthlyAbsences = 0;
      for (const date of monthDates) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const attendance = await Attendance.findOne({
          student: student._id,
          timestamp: { $gte: date, $lt: nextDate },
        });
        if (!attendance || attendance.status === 'excused') {
          monthlyAbsences++;
        }
      }

      let alertMessage = null;
      let alertKey = null;

      if (consecutiveAbsences >= absenceConsecutiveDays) {
        alertMessage = `🚨 تنبيه: الطالب ${student.name} غاب ${consecutiveAbsences} أيام متتالية. يُرجى التواصل مع ولي الأمر.`;
        alertKey = `absence_consecutive_${student._id}_${new Date().toISOString().split('T')[0]}`;
      } else if (monthlyAbsences >= absenceMonthlyDays) {
        alertMessage = `🚨 تنبيه: الطالب ${student.name} غاب ${monthlyAbsences} يوم هذا الشهر. يُرجى متابعة الحالة.`;
        alertKey = `absence_monthly_${student._id}_${new Date().toISOString().split('T')[0]}`;
      }

      if (alertMessage && alertKey) {
        const alert = new SmartAlert({
          student: student._id,
          parentEmail: student.parentEmail,
          type: 'absence',
          message: alertMessage,
          alertKey,
        });
        await alert.save();
        
        await sendPushNotificationToParent(
          '🚨 تنبيه غياب متكرر',
          alertMessage,
          { url: '/parent-dashboard' },
          student.parentEmail
        );
        
        alertCount++;
        console.log(`✅ [غياب] تم إرسال تنبيه لـ ${student.name} (${student.parentEmail})`);
      }
    }

    console.log(`📊 [غياب] انتهى التحليل، تم إرسال ${alertCount} تنبيه`);
    return alertCount;
  } catch (err) {
    console.error('❌ [غياب] خطأ في التحليل:', err);
    return 0;
  }
}

// ==========================================
// 3️⃣ تنبيهات التأخر الصباحي
// ==========================================
async function checkTardinessAlerts() {
  console.log('📊 [تأخر] بدء تحليل التأخر الصباحي...');

  try {
    const rule = await AlertRule.findOne({ type: 'tardiness' });
    if (!rule || !rule.enabled) {
      console.log('⏸️ [تأخر] التنبيهات معطلة');
      return;
    }

    const { tardinessPerWeek, cooldownDays } = rule.conditions || { tardinessPerWeek: 3, cooldownDays: 7 };

    const students = await Student.find();
    let alertCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const cooldownDate = getCooldownStartDate(cooldownDays || 7);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'tardiness',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

      const tardinessLimit = new Date();
      tardinessLimit.setHours(8, 30, 0, 0);

      const weekDates = getLastWeekDates();
      let tardyCount = 0;

      for (const date of weekDates) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const attendance = await Attendance.findOne({
          student: student._id,
          status: 'in',
          timestamp: { $gte: date, $lt: nextDate },
        });

        if (attendance) {
          const checkInTime = new Date(attendance.timestamp);
          const checkInHours = checkInTime.getHours();
          const checkInMinutes = checkInTime.getMinutes();

          if (checkInHours > tardinessLimit.getHours() || 
              (checkInHours === tardinessLimit.getHours() && checkInMinutes > tardinessLimit.getMinutes())) {
            tardyCount++;
          }
        }
      }

      if (tardyCount >= tardinessPerWeek) {
        const alertMessage = `⏰ تنبيه: الطالب ${student.name} تأخر ${tardyCount} مرات هذا الأسبوع. يُرجى الالتزام بمواعيد الحضور.`;
        const alertKey = `tardiness_${student._id}_${new Date().toISOString().split('T')[0]}`;

        const alert = new SmartAlert({
          student: student._id,
          parentEmail: student.parentEmail,
          type: 'tardiness',
          message: alertMessage,
          alertKey,
        });
        await alert.save();

        await sendPushNotificationToParent(
          '⏰ تنبيه تأخر صباحي',
          alertMessage,
          { url: '/parent-dashboard' },
          student.parentEmail
        );

        alertCount++;
        console.log(`✅ [تأخر] تم إرسال تنبيه لـ ${student.name} (${student.parentEmail})`);
      }
    }

    console.log(`📊 [تأخر] انتهى التحليل، تم إرسال ${alertCount} تنبيه`);
    return alertCount;
  } catch (err) {
    console.error('❌ [تأخر] خطأ في التحليل:', err);
    return 0;
  }
}

// ==========================================
// 5️⃣ تنبيهات الإنجاز (تحفيزية)
// ==========================================
async function checkAchievementAlerts() {
  console.log('📊 [إنجاز] بدء تحليل الإنجازات...');

  try {
    const rule = await AlertRule.findOne({ type: 'achievement' });
    if (!rule || !rule.enabled) {
      console.log('⏸️ [إنجاز] التنبيهات معطلة');
      return;
    }

    const { achievementConsecutiveDays, achievementMonthlyDays, cooldownDays } = rule.conditions || { achievementConsecutiveDays: 10, achievementMonthlyDays: 20, cooldownDays: 14 };

    const students = await Student.find();
    let alertCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const cooldownDate = getCooldownStartDate(cooldownDays || 14);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'achievement',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

      // 1. الحضور المتتالي
      let consecutiveAttendance = 0;
      let currentStreak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const attendance = await Attendance.findOne({
          student: student._id,
          status: 'in',
          timestamp: { $gte: date, $lt: nextDate },
        });

        if (attendance) {
          currentStreak++;
          if (currentStreak > consecutiveAttendance) {
            consecutiveAttendance = currentStreak;
          }
        } else {
          currentStreak = 0;
        }
      }

      // 2. الحضور الشهري
      const monthDates = getMonthDates();
      let monthlyAttendance = 0;
      for (const date of monthDates) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const attendance = await Attendance.findOne({
          student: student._id,
          status: 'in',
          timestamp: { $gte: date, $lt: nextDate },
        });
        if (attendance) {
          monthlyAttendance++;
        }
      }

      let alertMessage = null;
      let alertKey = null;

      if (consecutiveAttendance >= achievementConsecutiveDays) {
        alertMessage = `🎉 إنجاز رائع! الطالب ${student.name} حضر ${consecutiveAttendance} يوم متتالي. استمر بنفس الأداء المتميز!`;
        alertKey = `achievement_consecutive_${student._id}_${new Date().toISOString().split('T')[0]}`;
      } else if (monthlyAttendance >= achievementMonthlyDays) {
        alertMessage = `🎉 إنجاز مميز! الطالب ${student.name} حضر ${monthlyAttendance} يوم هذا الشهر. أداء رائع يستحق التقدير!`;
        alertKey = `achievement_monthly_${student._id}_${new Date().toISOString().split('T')[0]}`;
      }

      if (alertMessage && alertKey) {
        const alert = new SmartAlert({
          student: student._id,
          parentEmail: student.parentEmail,
          type: 'achievement',
          message: alertMessage,
          alertKey,
        });
        await alert.save();

        await sendPushNotificationToParent(
          '🎉 تنبيه إنجاز',
          alertMessage,
          { url: '/parent-dashboard' },
          student.parentEmail
        );

        alertCount++;
        console.log(`✅ [إنجاز] تم إرسال تنبيه لـ ${student.name} (${student.parentEmail})`);
      }
    }

    console.log(`📊 [إنجاز] انتهى التحليل، تم إرسال ${alertCount} تنبيه`);
    return alertCount;
  } catch (err) {
    console.error('❌ [إنجاز] خطأ في التحليل:', err);
    return 0;
  }
}

// ==========================================
// تشغيل جميع التنبيهات
// ==========================================
async function runAllSmartAlerts() {
  console.log('🔍 بدء تشغيل جميع التنبيهات الذكية...');
  
  try {
    await checkAbsenceAlerts();
    await checkTardinessAlerts();
    await checkAchievementAlerts();
    
    console.log('✅ انتهى تشغيل جميع التنبيهات الذكية بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تشغيل التنبيهات الذكية:', err);
  }
}

// ==========================================
// جدولة التنبيهات
// ==========================================
function startSmartAlertScheduler() {
  // 1️⃣ الغياب المتكرر: كل يوم الساعة 8:00 صباحاً
  cron.schedule('0 8 * * *', () => {
    console.log('⏰ [جدولة] تشغيل تنبيهات الغياب المتكرر');
    checkAbsenceAlerts();
  });

  // 3️⃣ التأخر الصباحي: كل يوم الساعة 10:00 صباحاً
  cron.schedule('0 10 * * *', () => {
    console.log('⏰ [جدولة] تشغيل تنبيهات التأخر الصباحي');
    checkTardinessAlerts();
  });

  // 5️⃣ الإنجاز التحفيزي: كل يوم الساعة 6:00 مساءً
  cron.schedule('0 18 * * *', () => {
    console.log('⏰ [جدولة] تشغيل تنبيهات الإنجاز');
    checkAchievementAlerts();
  });

  console.log('⏰ تم بدء جدولة التنبيهات الذكية (غياب 8:00، تأخر 10:00، إنجاز 18:00)');
}

module.exports = {
  startSmartAlertScheduler,
  runAllSmartAlerts,
  checkAbsenceAlerts,
  checkTardinessAlerts,
  checkAchievementAlerts,
};
