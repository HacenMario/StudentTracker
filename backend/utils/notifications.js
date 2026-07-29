const webpush = require('web-push');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { translate } = require('./i18n');

// دالة مساعدة لجلب لغة المستخدم
async function getUserLanguage(email) {
  try {
    const user = await User.findOne({ email });
    return user?.preferences?.language || 'ar';
  } catch {
    return 'ar';
  }
}

// إرسال إشعار لولي أمر محدد مع ترجمة حسب لغته
async function sendPushNotificationToParent(titleKey, bodyKey, data = {}, parentEmail) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة');
      return;
    }

    if (!parentEmail) {
      console.warn('⚠️ لم يتم تحديد بريد ولي الأمر');
      return;
    }

    // ✅ جلب لغة المستخدم
    const lang = await getUserLanguage(parentEmail);
    console.log(`🌍 لغة المستخدم ${parentEmail}: ${lang}`);

    // ✅ ترجمة النصوص
    const title = translate(lang, titleKey);
    const body = translate(lang, bodyKey, data);

    const subscriptions = await Subscription.find({ userEmail: parentEmail });
    console.log(`📊 عدد المشتركين للبريد ${parentEmail}: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.warn(`⚠️ لا يوجد اشتراكات للبريد: ${parentEmail}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data,
      url: data.url || '/parent-dashboard',
    });

    console.log(`📨 جاري إرسال إشعار خاص لـ ${parentEmail} (باللغة ${lang})`);

    let successCount = 0;
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        await webpush.sendNotification(pushSubscription, payload);
        console.log(`✅ تم إرسال الإشعار إلى مشترك (بريد: ${sub.userEmail})`);
        successCount++;
      } catch (err) {
        console.error(`❌ فشل إرسال الإشعار:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await Subscription.findByIdAndDelete(sub._id);
          console.log(`🗑️ تم حذف اشتراك منتهي`);
        }
      }
    }

    console.log(`✅ انتهى إرسال الإشعار الخاص (نجح ${successCount} من ${subscriptions.length})`);

  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعار الخاص:', err);
  }
}

// دالة الإشعارات العامة (ترسل لجميع المشتركين دون ترجمة، أو يمكن ترجمتها حسب لغة كل مستخدم)
async function sendPushNotificationToAll(title, body, data = {}) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️ مفاتيح VAPID غير متوفرة');
      return;
    }

    // للإشعارات العامة، نرسل نفس النص لجميع المستخدمين (يمكن ترجمته لاحقاً)
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

module.exports = { sendPushNotificationToParent, sendPushNotificationToAll };
