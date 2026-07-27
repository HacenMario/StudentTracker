const cron = require('node-cron');
const Student = require('../models/Student');
const SchoolSettings = require('../models/SchoolSettings');
const Notification = require('../models/Notification');
const { sendPushNotificationToParent } = require('../utils/notifications');

// دالة إرسال إشعارات الخروج
async function sendLeavingNotifications() {
  try {
    // 1. جلب إعدادات المدرسة
    const settings = await SchoolSettings.findOne();
    if (!settings) {
      console.warn('⚠️ لا توجد إعدادات مدرسة');
      return;
    }

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    
    // 2. حساب الوقت المتبقي للخروج
    const [endHour, endMinute] = settings.schoolEndTime.split(':').map(Number);
    const endTimeMinutes = endHour * 60 + endMinute;
    const currentTimeMinutes = currentHours * 60 + currentMinutes;
    const minutesUntilEnd = endTimeMinutes - currentTimeMinutes;

    // 3. التحقق من أن الوقت الحالي يطابق وقت الإشعار (قبل X دقيقة)
    const notifyMinutesBefore = settings.notificationBeforeMinutes || 30;
    if (minutesUntilEnd !== notifyMinutesBefore) {
      // ليس الوقت المناسب للإرسال
      return;
    }

    // 4. جلب جميع الطلاب الموجودين داخل المدرسة
    const students = await Student.find({ isInside: true });
    if (students.length === 0) {
      console.log('📭 لا يوجد طلاب داخل المدرسة لإرسال إشعارات لهم');
      return;
    }

    console.log(`📢 جاري إرسال إشعارات الخروج لـ ${students.length} طالب`);

    // 5. إرسال إشعار لكل ولي أمر
    let sentCount = 0;
    for (const student of students) {
      if (!student.parentEmail) continue;

      const message = `⏰ تنبيه: باقي ${notifyMinutesBefore} دقيقة على خروج ${student.name} من المدرسة`;
      
      // حفظ الإشعار في قاعدة البيانات
      await new Notification({
        target: student.parentEmail,
        message: message,
        sender: 'System',
      }).save();

      // إرسال إشعار Web Push لولي الأمر
      await sendPushNotificationToParent(
        'تنبيه الخروج',
        message,
        { url: '/parent-dashboard' },
        student.parentEmail
      );
      sentCount++;
    }

    console.log(`✅ تم إرسال ${sentCount} إشعار خروج بنجاح`);
  } catch (err) {
    console.error('❌ خطأ في إرسال إشعارات الخروج:', err);
  }
}

// تشغيل الجدولة كل دقيقة (للتحقق من الوقت)
function startNotificationScheduler() {
  // التحقق كل دقيقة
  cron.schedule('* * * * *', () => {
    sendLeavingNotifications();
  });
  console.log('⏰ بدأت خدمة إشعارات الخروج التلقائية');
}

module.exports = { startNotificationScheduler };
