const cron = require('node-cron');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const Holiday = require('../models/Holiday');
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
// دالة مساعدة: جلب العطل في فترة زمنية
// ==========================================
async function getHolidaysInRange(startDate, endDate) {
  try {
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate },
    });
    return holidays.map(h => new Date(h.date).toISOString().split('T')[0]);
  } catch (err) {
    console.error('❌ خطأ في جلب العطل:', err);
    return [];
  }
}

// ==========================================
// دالة مساعدة: التحقق مما إذا كان اليوم عطلة
// ==========================================
async function isHoliday(date) {
  const dateStr = date.toISOString().split('T')[0];
  const holiday = await Holiday.findOne({
    date: { $gte: new Date(dateStr), $lt: new Date(new Date(dateStr).setDate(new Date(dateStr).getDate() + 1)) },
  });
  return !!holiday;
}

// ==========================================
// دالة مساعدة: جلب أيام الدوام فقط (استثناء العطل)
// ==========================================
async function getSchoolDaysInRange(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  // ✅ جلب العطل المفعلة فقط
  const holidays = await Holiday.find({
    date: { $gte: startDate, $lte: endDate },
    isActive: true  // ✅ استثناء العطل المعطلة فقط
  });
  
  const holidayDates = holidays.map(h => 
    new Date(h.date).toISOString().split('T')[0]
  );
  
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (!holidayDates.includes(dateStr)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// ==========================================
// 1️⃣ تنبيهات الغياب المتكرر (معدل)
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

      const cooldownDate = getCooldownStartDate(cooldownDays || 7);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'absence',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

      // ✅ جلب أيام الدوام في آخر 30 يوم (استثناء العطل)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      
      const schoolDays = await getSchoolDaysInRange(startDate, today);
      
      // 1. الغياب المتتالي (فقط في أيام الدوام)
      let consecutiveAbsences = 0;
      let currentStreak = 0;
      
      for (const date of schoolDays.reverse()) {
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

      // 2. الغياب الشهري (فقط في أيام الدوام)
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const monthSchoolDays = await getSchoolDaysInRange(monthStart, monthEnd);
      
      let monthlyAbsences = 0;
      for (const date of monthSchoolDays) {
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
        alertMessage = `🚨 تنبيه: الطالب ${student.name} غاب ${consecutiveAbsences} أيام متتالية (في أيام الدوام). يُرجى التواصل مع ولي الأمر.`;
        alertKey = `absence_consecutive_${student._id}_${new Date().toISOString().split('T')[0]}`;
      } else if (monthlyAbsences >= absenceMonthlyDays) {
        alertMessage = `🚨 تنبيه: الطالب ${student.name} غاب ${monthlyAbsences} يوم هذا الشهر (في أيام الدوام). يُرجى متابعة الحالة.`;
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
// 3️⃣ تنبيهات التأخر الصباحي (معدل)
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

      // ✅ جلب أيام الدوام في الأسبوع الماضي فقط
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 7);
      
      const schoolDays = await getSchoolDaysInRange(weekStart, today);
      
      let tardyCount = 0;
      for (const date of schoolDays) {
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
        const alertMessage = `⏰ تنبيه: الطالب ${student.name} تأخر ${tardyCount} مرات هذا الأسبوع (في أيام الدوام). يُرجى الالتزام بمواعيد الحضور.`;
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
// 5️⃣ تنبيهات الإنجاز التحفيزي (معدل)
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

      // ✅ جلب أيام الدوام في آخر 30 يوم
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      
      const schoolDays = await getSchoolDaysInRange(startDate, today);
      
      // 1. الحضور المتتالي
      let consecutiveAttendance = 0;
      let currentStreak = 0;
      
      for (const date of schoolDays.reverse()) {
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
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const monthSchoolDays = await getSchoolDaysInRange(monthStart, monthEnd);
      
      let monthlyAttendance = 0;
      for (const date of monthSchoolDays) {
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
        alertMessage = `🎉 إنجاز رائع! الطالب ${student.name} حضر ${consecutiveAttendance} يوم متتالي (في أيام الدوام). استمر بنفس الأداء المتميز!`;
        alertKey = `achievement_consecutive_${student._id}_${new Date().toISOString().split('T')[0]}`;
      } else if (monthlyAttendance >= achievementMonthlyDays) {
        alertMessage = `🎉 إنجاز مميز! الطالب ${student.name} حضر ${monthlyAttendance} يوم هذا الشهر (في أيام الدوام). أداء رائع يستحق التقدير!`;
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
  getSchoolDaysInRange,
};
