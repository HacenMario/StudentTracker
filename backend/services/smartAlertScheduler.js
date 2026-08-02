// backend/services/smartAlertScheduler.js
// ==========================================
// جدولة التنبيهات الذكية - النسخة المترجمة
// ==========================================

const cron = require('node-cron');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const Holiday = require('../models/Holiday');
const { sendPushNotificationToParent } = require('../utils/notifications');
const { translate } = require('../utils/i18n');

// ==========================================
// دوال مساعدة
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

function getCooldownStartDate(cooldownDays) {
  const date = new Date();
  date.setDate(date.getDate() - cooldownDays);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getHolidaysInRange(startDate, endDate) {
  try {
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate },
    });
    return holidays.map(h => new Date(h.date).toISOString().split('T')[0]);
  } catch (err) {
    console.error('❌ Error fetching holidays:', err);
    return [];
  }
}

async function isHoliday(date) {
  const dateStr = date.toISOString().split('T')[0];
  const holiday = await Holiday.findOne({
    date: { $gte: new Date(dateStr), $lt: new Date(new Date(dateStr).setDate(new Date(dateStr).getDate() + 1)) },
  });
  return !!holiday;
}

/**
 * جلب أيام الدوام فقط (استثناء العطل)
 */
async function getSchoolDaysInRange(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  const holidays = await Holiday.find({
    $or: [
      { date: { $gte: startDate, $lte: endDate } },
      { endDate: { $gte: startDate, $lte: endDate } },
      { date: { $lte: startDate }, endDate: { $gte: startDate } }
    ],
    isActive: true
  });

  const holidayDates = new Set();
  for (const holiday of holidays) {
    const start = new Date(holiday.date);
    const endDate = holiday.endDate ? new Date(holiday.endDate) : new Date(holiday.date);
    let currentDate = new Date(start);
    while (currentDate <= endDate) {
      holidayDates.add(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (!holidayDates.has(dateStr)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/**
 * جلب لغة ولي الأمر من كائن الطالب
 */
function getParentLang(student) {
  if (student.parent && student.parent.preferences && student.parent.preferences.language) {
    const lang = student.parent.preferences.language;
    if (['ar', 'fr', 'en'].includes(lang)) return lang;
  }
  return 'ar';
}

// ==========================================
// 1️⃣ تنبيهات الغياب المتكرر
// ==========================================
async function checkAbsenceAlerts() {
  console.log('📊 [Absence] Starting repeated absence analysis...');

  try {
    const rule = await AlertRule.findOne({ type: 'absence' });
    if (!rule || !rule.enabled) {
      console.log('⏸️ [Absence] Alerts are disabled');
      return;
    }

    const { absenceConsecutiveDays = 3, absenceMonthlyDays = 5, cooldownDays = 7 } = rule.conditions || {};

    const students = await Student.find().populate('parent');
    let alertCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const lang = getParentLang(student);

      const cooldownDate = getCooldownStartDate(cooldownDays || 7);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'absence',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);

      const schoolDays = await getSchoolDaysInRange(startDate, today);

      // 1. الغياب المتتالي
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

      // 2. الغياب الشهري
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
      let pushTitle = translate(lang, 'push.absence_title');

      if (consecutiveAbsences >= absenceConsecutiveDays) {
        alertMessage = translate(lang, 'alert.absence.consecutive', {
          name: student.name,
          days: consecutiveAbsences,
        });
        alertKey = `absence_consecutive_${student._id}_${new Date().toISOString().split('T')[0]}`;
      } else if (monthlyAbsences >= absenceMonthlyDays) {
        alertMessage = translate(lang, 'alert.absence.monthly', {
          name: student.name,
          days: monthlyAbsences,
        });
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

        await sendPushNotificationToParent(pushTitle, alertMessage, { url: '/parent-dashboard' }, student.parentEmail);

        alertCount++;
        console.log(`✅ [Absence] Alert sent: ${student.name} (${student.parentEmail}, lang: ${lang})`);
      }
    }

    console.log(`📊 [Absence] Analysis complete — ${alertCount} alerts sent`);
    return alertCount;
  } catch (err) {
    console.error('❌ [Absence] Analysis error:', err);
    return 0;
  }
}

// ==========================================
// 2️⃣ تنبيهات التأخر الصباحي
// ==========================================
async function checkTardinessAlerts() {
  console.log('📊 [Tardiness] Starting morning tardiness analysis...');

  try {
    const rule = await AlertRule.findOne({ type: 'tardiness' });
    if (!rule || !rule.enabled) {
      console.log('⏸️ [Tardiness] Alerts are disabled');
      return;
    }

    const { tardinessPerWeek = 3, cooldownDays = 7 } = rule.conditions || {};

    const students = await Student.find().populate('parent');
    let alertCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const lang = getParentLang(student);

      const cooldownDate = getCooldownStartDate(cooldownDays || 7);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'tardiness',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

      const tardinessLimit = new Date();
      tardinessLimit.setHours(8, 30, 0, 0);

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
          if (
            checkInTime.getHours() > tardinessLimit.getHours() ||
            (checkInTime.getHours() === tardinessLimit.getHours() && checkInTime.getMinutes() > tardinessLimit.getMinutes())
          ) {
            tardyCount++;
          }
        }
      }

      if (tardyCount >= tardinessPerWeek) {
        const alertMessage = translate(lang, 'alert.tardiness', { name: student.name, count: tardyCount });
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
          translate(lang, 'push.tardiness_title'),
          alertMessage,
          { url: '/parent-dashboard' },
          student.parentEmail,
        );

        alertCount++;
        console.log(`✅ [Tardiness] Alert sent: ${student.name} (${student.parentEmail}, lang: ${lang})`);
      }
    }

    console.log(`📊 [Tardiness] Analysis complete — ${alertCount} alerts sent`);
    return alertCount;
  } catch (err) {
    console.error('❌ [Tardiness] Analysis error:', err);
    return 0;
  }
}

// ==========================================
// 3️⃣ تنبيهات الإنجاز التحفيزي
// ==========================================
async function checkAchievementAlerts() {
  console.log('📊 [Achievement] Starting motivational achievement analysis...');

  try {
    const rule = await AlertRule.findOne({ type: 'achievement' });
    if (!rule || !rule.enabled) {
      console.log('⏸️ [Achievement] Alerts are disabled');
      return;
    }

    const { achievementConsecutiveDays = 10, achievementMonthlyDays = 20, cooldownDays = 14 } = rule.conditions || {};

    const students = await Student.find().populate('parent');
    let alertCount = 0;

    for (const student of students) {
      if (!student.parentEmail) continue;

      const lang = getParentLang(student);

      const cooldownDate = getCooldownStartDate(cooldownDays || 14);
      const lastAlert = await SmartAlert.findOne({
        student: student._id,
        type: 'achievement',
        createdAt: { $gte: cooldownDate },
      });
      if (lastAlert) continue;

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
        alertMessage = translate(lang, 'alert.achievement.consecutive', {
          name: student.name,
          days: consecutiveAttendance,
        });
        alertKey = `achievement_consecutive_${student._id}_${new Date().toISOString().split('T')[0]}`;
      } else if (monthlyAttendance >= achievementMonthlyDays) {
        alertMessage = translate(lang, 'alert.achievement.monthly', {
          name: student.name,
          days: monthlyAttendance,
        });
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
          translate(lang, 'push.achievement_title'),
          alertMessage,
          { url: '/parent-dashboard' },
          student.parentEmail,
        );

        alertCount++;
        console.log(`✅ [Achievement] Alert sent: ${student.name} (${student.parentEmail}, lang: ${lang})`);
      }
    }

    console.log(`📊 [Achievement] Analysis complete — ${alertCount} alerts sent`);
    return alertCount;
  } catch (err) {
    console.error('❌ [Achievement] Analysis error:', err);
    return 0;
  }
}

// ==========================================
// تشغيل جميع التنبيهات
// ==========================================
async function runAllSmartAlerts() {
  console.log('🔍 Starting all smart alerts...');

  try {
    await checkAbsenceAlerts();
    await checkTardinessAlerts();
    await checkAchievementAlerts();

    console.log('✅ All smart alerts completed successfully');
  } catch (err) {
    console.error('❌ Error running smart alerts:', err);
  }
}

// ==========================================
// جدولة التنبيهات
// ==========================================
function startSmartAlertScheduler() {
  // 1️⃣ الغياب المتكرر: كل يوم الساعة 8:00 صباحاً
  cron.schedule('0 8 * * *', () => {
    console.log('⏰ [Scheduler] Running absence alerts');
    checkAbsenceAlerts();
  });

  // 2️⃣ التأخر الصباحي: كل يوم الساعة 10:00 صباحاً
  cron.schedule('0 10 * * *', () => {
    console.log('⏰ [Scheduler] Running tardiness alerts');
    checkTardinessAlerts();
  });

  // 3️⃣ الإنجاز التحفيزي: كل يوم الساعة 6:00 مساءً
  cron.schedule('0 18 * * *', () => {
    console.log('⏰ [Scheduler] Running achievement alerts');
    checkAchievementAlerts();
  });

  console.log('⏰ Smart alert scheduler started (Absence 8:00, Tardiness 10:00, Achievement 18:00)');
}

module.exports = {
  startSmartAlertScheduler,
  runAllSmartAlerts,
  checkAbsenceAlerts,
  checkTardinessAlerts,
  checkAchievementAlerts,
  getSchoolDaysInRange,
};
