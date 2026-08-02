// backend/utils/i18n.js
// ==========================================
// نظام الترجمة الموحد للـ Backend
// يدعم: العربية (ar) - الفرنسية (fr) - الإنجليزية (en)
// ==========================================

const translations = {
  ar: {
    // --- Push Notification Titles ---
    'push.status_title': 'تحديث حالة ابنك',
    'push.leaving_title': '⏰ تنبيه الخروج',
    'push.general_title': '📢 إشعار من المدرسة',
    'push.private_title': '📩 إشعار خاص من المدرسة',
    'push.bulk_title': 'تحديث جماعي',
    'push.absence_title': '🚨 تنبيه غياب متكرر',
    'push.tardiness_title': '⏰ تنبيه تأخر صباحي',
    'push.achievement_title': '🎉 تنبيه إنجاز',
    'push.leave_approved_title': '✅ طلب عذر غياب - موافقة',
    'push.leave_rejected_title': '❌ طلب عذر غياب - رفض',
    'push.test_title': '🧪 تنبيه خروج (اختبار)',

    // --- Push Notification Bodies ---
    'push.status_body': 'التلميذ {name} أصبح {status}',
    'push.leaving_body': '⏰ تنبيه: باقي {minutes} دقيقة على خروج {studentName} من المدرسة',

    // --- Web Push (التنبيهات المرسلة عبر VAPID) ---
    'webpush.status_title': '🏫 تحديث حالة الحضور',
    'webpush.general': '📢 إشعار من المدرسة',

    // --- Smart Alerts - Absence ---
    'alert.absence.consecutive': '🚨 تنبيه: الطالب {name} غاب {days} أيام متتالية (في أيام الدوام). يُرجى التواصل مع ولي الأمر.',
    'alert.absence.monthly': '🚨 تنبيه: الطالب {name} غاب {days} يوم هذا الشهر (في أيام الدوام). يُرجى متابعة الحالة.',

    // --- Smart Alerts - Tardiness ---
    'alert.tardiness': '⏰ تنبيه: الطالب {name} تأخر {count} مرات هذا الأسبوع (في أيام الدوام). يُرجى الالتزام بمواعيد الحضور.',

    // --- Smart Alerts - Achievement ---
    'alert.achievement.consecutive': '🎉 إنجاز رائع! الطالب {name} حضر {days} يوم متتالي (في أيام الدوام). استمر بنفس الأداء المتميز!',
    'alert.achievement.monthly': '🎉 إنجاز مميز! الطالب {name} حضر {days} يوم هذا الشهر (في أيام الدوام). أداء رائع يستحق التقدير!',

    // --- Leave Requests ---
    'leave.approved': 'تمت الموافقة ✅',
    'leave.rejected': 'تم الرفض ❌',
    'leave.new_request': '📩 طلب عذر غياب جديد من {student}',
    'leave.updated': '📩 طلب عذر {student}: {status}',

    // --- Attendance ---
    'attendance.student_became': 'التلميذ {name} أصبح {status}',
    'attendance.student_became_qr': 'التلميذ {name} أصبح {status} (عن طريق QR)',
    'attendance.student_added': 'تم إضافة الطالب {name}',
    'attendance.student_updated': 'تم تعديل الطالب {name}',
    'attendance.student_deleted': 'تم حذف الطالب',
    'attendance.student_toggled': 'تم تغيير حالة الطالب',
    'attendance.all_inside': 'تم تغيير حالة جميع الطلاب إلى داخل 🏫',
    'attendance.all_outside': 'تم تغيير حالة جميع الطلاب إلى خارج 🚪',
    'attendance.status_inside': 'داخل 🏫',
    'attendance.status_outside': 'خارج 🚪',

    // --- Parent Messages ---
    'parent.message_notification': '📩 رسالة من ولي أمر {parent} بخصوص {student}',

    // --- Holiday Notifications ---
    'holiday.added': '✅ تم إضافة العطلة بنجاح',
    'holiday.deleted': '✅ تم حذف العطلة بنجاح',
    'holiday.updated': '✅ تم تعديل العطلة بنجاح',
    'holiday.toggled_on': '✅ تم تفعيل العطلة بنجاح',
    'holiday.toggled_off': '✅ تم تعطيل العطلة بنجاح',

    // --- System ---
    'system.sender': 'النظام',
    'common.time': 'وقت:',
    'common.error': 'حدث خطأ',
  },

  fr: {
    // --- Push Notification Titles ---
    'push.status_title': 'Mise à jour du statut de votre enfant',
    'push.leaving_title': '⏰ Alerte de sortie',
    'push.general_title': "📢 Notification de l'école",
    'push.private_title': "📩 Notification privée de l'école",
    'push.bulk_title': 'Mise à jour collective',
    'push.absence_title': "🚨 Alerte d'absence répétée",
    'push.tardiness_title': '⏰ Alerte de retard matinal',
    'push.achievement_title': '🎉 Alerte de réussite',
    'push.leave_approved_title': "✅ Demande d'excuse - Approuvée",
    'push.leave_rejected_title': "❌ Demande d'excuse - Rejetée",
    'push.test_title': '🧪 Alerte de sortie (Test)',

    // --- Push Notification Bodies ---
    'push.status_body': "L'élève {name} est {status}",
    'push.leaving_body': "⏰ Alerte : il reste {minutes} minutes avant la sortie de {studentName} de l'école",

    // --- Web Push ---
    'webpush.status_title': '🏫 Mise à jour du statut de présence',
    'webpush.general': "📢 Notification de l'école",

    // --- Smart Alerts - Absence ---
    'alert.absence.consecutive': "🚨 Alerte : l'élève {name} a été absent {days} jours consécutifs (jours de classe). Veuillez contacter le parent.",
    'alert.absence.monthly': "🚨 Alerte : l'élève {name} a été absent {days} jours ce mois-ci (jours de classe). Veuillez suivre la situation.",

    // --- Smart Alerts - Tardiness ---
    'alert.tardiness': "⏰ Alerte : l'élève {name} est arrivé en retard {count} fois cette semaine (jours de classe). Veuillez respecter les horaires.",

    // --- Smart Alerts - Achievement ---
    'alert.achievement.consecutive': "🎉 Félicitations ! L'élève {name} a été présent {days} jours consécutifs (jours de classe). Continuez comme ça !",
    'alert.achievement.monthly': "🎉 Bravo ! L'élève {name} a été présent {days} jours ce mois-ci (jours de classe). Excellente performance !",

    // --- Leave Requests ---
    'leave.approved': 'Approuvée ✅',
    'leave.rejected': 'Rejetée ❌',
    'leave.new_request': "📩 Nouvelle demande d'excuse de {student}",
    'leave.updated': "📩 Demande d'excuse {student} : {status}",

    // --- Attendance ---
    'attendance.student_became': "L'élève {name} est {status}",
    'attendance.student_became_qr': "L'élève {name} est {status} (via QR)",
    'attendance.student_added': "Élève {name} ajouté",
    'attendance.student_updated': "Élève {name} modifié",
    'attendance.student_deleted': 'Élève supprimé',
    'attendance.student_toggled': "Statut de l'élève modifié",
    'attendance.all_inside': 'Tous les élèves sont à l\'intérieur 🏫',
    'attendance.all_outside': 'Tous les élèves sont à l\'extérieur 🚪',
    'attendance.status_inside': 'À l\'intérieur 🏫',
    'attendance.status_outside': 'À l\'extérieur 🚪',

    // --- Parent Messages ---
    'parent.message_notification': '📩 Message du parent {parent} concernant {student}',

    // --- Holiday Notifications ---
    'holiday.added': '✅ Jour férié ajouté avec succès',
    'holiday.deleted': '✅ Jour férié supprimé avec succès',
    'holiday.updated': '✅ Jour férié modifié avec succès',
    'holiday.toggled_on': '✅ Jour férié activé avec succès',
    'holiday.toggled_off': '✅ Jour férié désactivé avec succès',

    // --- System ---
    'system.sender': 'Système',
    'common.time': 'Heure :',
    'common.error': 'Une erreur est survenue',
  },

  en: {
    // --- Push Notification Titles ---
    'push.status_title': "Your Child's Status Update",
    'push.leaving_title': '⏰ Leaving Alert',
    'push.general_title': '📢 School Notification',
    'push.private_title': '📩 Private School Notification',
    'push.bulk_title': 'Bulk Update',
    'push.absence_title': '🚨 Repeated Absence Alert',
    'push.tardiness_title': '⏰ Morning Tardiness Alert',
    'push.achievement_title': '🎉 Achievement Alert',
    'push.leave_approved_title': '✅ Leave Request - Approved',
    'push.leave_rejected_title': '❌ Leave Request - Rejected',
    'push.test_title': '🧪 Leaving Alert (Test)',

    // --- Push Notification Bodies ---
    'push.status_body': 'Student {name} is {status}',
    'push.leaving_body': '⏰ Alert: {minutes} minutes until {studentName} leaves school',

    // --- Web Push ---
    'webpush.status_title': '🏫 Attendance Status Update',
    'webpush.general': '📢 School Notification',

    // --- Smart Alerts - Absence ---
    'alert.absence.consecutive': '🚨 Alert: Student {name} has been absent {days} consecutive days (school days). Please contact the parent.',
    'alert.absence.monthly': '🚨 Alert: Student {name} has been absent {days} days this month (school days). Please follow up.',

    // --- Smart Alerts - Tardiness ---
    'alert.tardiness': '⏰ Alert: Student {name} was late {count} times this week (school days). Please adhere to arrival times.',

    // --- Smart Alerts - Achievement ---
    'alert.achievement.consecutive': '🎉 Amazing! Student {name} has attended {days} consecutive days (school days). Keep up the great work!',
    'alert.achievement.monthly': '🎉 Great job! Student {name} has attended {days} days this month (school days). Outstanding performance!',

    // --- Leave Requests ---
    'leave.approved': 'Approved ✅',
    'leave.rejected': 'Rejected ❌',
    'leave.new_request': '📩 New leave request from {student}',
    'leave.updated': '📩 Leave request {student}: {status}',

    // --- Attendance ---
    'attendance.student_became': 'Student {name} is {status}',
    'attendance.student_became_qr': 'Student {name} is {status} (via QR)',
    'attendance.student_added': 'Student {name} added',
    'attendance.student_updated': 'Student {name} updated',
    'attendance.student_deleted': 'Student deleted',
    'attendance.student_toggled': 'Student status changed',
    'attendance.all_inside': 'All students are inside 🏫',
    'attendance.all_outside': 'All students are outside 🚪',
    'attendance.status_inside': 'Inside 🏫',
    'attendance.status_outside': 'Outside 🚪',

    // --- Parent Messages ---
    'parent.message_notification': '📩 Message from parent {parent} regarding {student}',

    // --- Holiday Notifications ---
    'holiday.added': '✅ Holiday added successfully',
    'holiday.deleted': '✅ Holiday deleted successfully',
    'holiday.updated': '✅ Holiday updated successfully',
    'holiday.toggled_on': '✅ Holiday activated successfully',
    'holiday.toggled_off': '✅ Holiday deactivated successfully',

    // --- System ---
    'system.sender': 'System',
    'common.time': 'Time:',
    'common.error': 'An error occurred',
  },
};

/**
 * ترجمة مفتاح إلى اللغة المطلوبة مع استبدال المتغيرات
 * @param {string} lang - رمز اللغة (ar, fr, en)
 * @param {string} key - مفتاح الترجمة
 * @param {object} params - متغيرات الاستبدال
 * @returns {string} النص المترجم
 */
function translate(lang, key, params = {}) {
  const langTranslations = translations[lang] || translations['ar'];
  let text = langTranslations[key];

  // إذا لم يتم العثور على الترجمة، نبحث في العربية (اللغة الافتراضية)
  if (!text) {
    text = translations['ar'][key] || key;
  }

  // استبدال المتغيرات
  for (const [paramKey, paramValue] of Object.entries(params)) {
    text = text.replace(`{${paramKey}}`, paramValue);
  }
  return text;
}

/**
 * اكتشاف اللغة المفضلة للمستخدم
 * الأولوية: إعدادات المستخدم > Accept-Language header > العربية (افتراضي)
 * @param {object} user - كائن المستخدم (قد يكون null)
 * @param {object} req - كائن الطلب (Express req)
 * @returns {string} رمز اللغة
 */
function detectUserLang(user, req) {
  // 1. التحقق من إعدادات المستخدم
  if (user && user.preferences && user.preferences.language) {
    const pref = user.preferences.language;
    if (['ar', 'fr', 'en'].includes(pref)) return pref;
  }

  // 2. التحقق من Accept-Language header
  if (req && req.headers && req.headers['accept-language']) {
    const acceptLang = req.headers['accept-language'].toLowerCase();
    if (acceptLang.includes('fr')) return 'fr';
    if (acceptLang.includes('en')) return 'en';
  }

  // 3. الافتراضي: العربية
  return 'ar';
}

module.exports = { translate, detectUserLang };
