// backend/services/notificationScheduler.js
// ==========================================
// جدولة إشعارات الخروج المبكر - النسخة المترجمة
// ==========================================

const cron = require('node-cron');
const Student = require('../models/Student');
const SchoolSettings = require('../models/SchoolSettings');
const Notification = require('../models/Notification');
const { sendPushNotificationToParent } = require('../utils/notifications');
const { translate } = require('../utils/i18n');

/**
 * جلب لغة ولي الأمر
 */
function getParentLang(student) {
  if (student.parent && student.parent.preferences && student.parent.preferences.language) {
    const lang = student.parent.preferences.language;
    if (['ar', 'fr', 'en'].includes(lang)) return lang;
  }
  return 'ar';
}

async function sendLeavingNotifications() {
  try {
    console.log('⏰ Running leaving notification task...');

    const settings = await SchoolSettings.findOne();
    if (!settings) {
      console.warn('⚠️ No school settings found');
      return;
    }

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();

    const [endHour, endMinute] = settings.schoolEndTime.split(':').map(Number);
    const endTimeMinutes = endHour * 60 + endMinute;
    const currentTimeMinutes = currentHours * 60 + currentMinutes;
    const minutesUntilEnd = endTimeMinutes - currentTimeMinutes;

    const notifyMinutesBefore = settings.notificationBeforeMinutes || 30;

    console.log(
      `📊 Current: ${currentHours}:${String(currentMinutes).padStart(2, '0')}, ` +
      `End: ${endHour}:${String(endMinute).padStart(2, '0')}, ` +
      `Remaining: ${minutesUntilEnd} min, Required: ${notifyMinutesBefore} min`,
    );

    if (minutesUntilEnd !== notifyMinutesBefore) {
      console.log(`⏳ Not notification time yet (remaining: ${minutesUntilEnd} min)`);
      return;
    }

    const students = await Student.find({ isInside: true }).populate('parent');
    if (students.length === 0) {
      console.log('📭 No students currently inside school');
      return;
    }

    console.log(`📢 Sending leaving notifications for ${students.length} student(s)`);

    let sentCount = 0;
    for (const student of students) {
      if (!student.parentEmail) continue;

      const lang = getParentLang(student);

      // ✅ Push notification بلغة ولي الأمر
      const pushTitle = translate(lang, 'push.leaving_title');
      const pushBody = translate(lang, 'push.leaving_body', {
        minutes: notifyMinutesBefore,
        studentName: student.name,
      });

      await sendPushNotificationToParent(pushTitle, pushBody, { url: '/parent-dashboard' }, student.parentEmail);

      // ✅ حفظ الإشعار في قاعدة البيانات (نخزنه بجميع اللغات للعرض في اللوحات)
      const messageForDb = translate('ar', 'push.leaving_body', {
        minutes: notifyMinutesBefore,
        studentName: student.name,
      });

      await new Notification({
        target: student.parentEmail,
        message: `⏰ ${messageForDb}`,
        sender: translate(lang, 'system.sender'),
      }).save();

      sentCount++;
    }

    console.log(`✅ Successfully sent ${sentCount} leaving notification(s)`);
  } catch (err) {
    console.error('❌ Error sending leaving notifications:', err);
  }
}

function startNotificationScheduler() {
  // تشغيل كل دقيقة للتحقق من الوقت
  cron.schedule('* * * * *', () => {
    sendLeavingNotifications();
  });
  console.log('⏰ Leaving notification service started (checks every minute)');
}

module.exports = { startNotificationScheduler };
