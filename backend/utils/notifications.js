const webpush = require('web-push');
const Subscription = require('../models/Subscription');

async function sendPushNotificationToAll(title, body, data = {}) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة');
      return;
    }

    const subscriptions = await Subscription.find({});
    console.log(`📊 عدد المشتركين الكلي: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn('⚠️ لا يوجد مشتركين');
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data,
      url: data.url || '/',
    });

    console.log(`📨 جاري إرسال الإشعار لـ ${subscriptions.length} مشترك`);

    let successCount = 0;
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ تم إرسال الإشعار إلى مشترك (بريد: ${sub.userEmail || 'غير معروف'})`);
        successCount++;
      } catch (err) {
        console.error(`❌ فشل إرسال الإشعار:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
          console.log(`🗑️ تم حذف اشتراك منتهي`);
        }
      }
    }

    console.log(`✅ انتهى إرسال الإشعارات (نجح ${successCount} من ${subscriptions.length})`);

  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعارات:', err);
  }
}

module.exports = { sendPushNotificationToAll };
