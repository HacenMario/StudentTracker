const cron = require('node-cron');
const Student = require('../models/Student');
const SchoolSettings = require('../models/SchoolSettings');
const Notification = require('../models/Notification');
const { sendPushNotificationToParent } = require('../utils/notifications');

async function sendLeavingNotifications() {
  try {
    console.log('⏰ تشغيل مهمة إشعارات الخروج...');

    const settings = await SchoolSettings.findOne();
    if (!settings) {
      console.warn('⚠️ لا توجد إعدادات مدرسة');
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

    if (minutesUntilEnd !== notifyMinutesBefore) {
      return;
    }

    const students = await Student.find({ isInside: true });
    if (students.length === 0) {
      console.log('📭 لا يوجد طلاب داخل المدرسة');
      return;
    }

    let sentCount = 0;
    for (const student of students) {
      if (!student.parentEmail) continue;

      const message = `⏰ تنبيه: باقي ${notifyMinutesBefore} دقيقة على خروج ${student.name} من المدرسة`;

      await new Notification({
        target: student.parentEmail,
        message: message,
        sender: 'System',
      }).save();

      await sendPushNotificationToParent(
        '⏰ تنبيه الخروج',
        message,
        { url: '/parent-dashboard' },
        student.parentEmail
      );
      sentCount++;
    }

    console.log(`✅ تم إرسال ${sentCount} إشعار خروج مبكر بنجاح`);
  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعارات المبكرة:', err);
  }
}

function startNotificationScheduler() {
  cron.schedule('* * * * *', () => {
    sendLeavingNotifications();
  });
  console.log('⏰ بدأت خدمة إشعارات الخروج التلقائية (تعمل كل دقيقة)');
}

module.exports = { startNotificationScheduler };
