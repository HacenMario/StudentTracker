// backend/utils/i18n.js
const translations = {
  ar: {
    // إشعارات الخروج المبكر
    'leaving_title': '⏰ تنبيه الخروج',
    'leaving_body': '⏰ تنبيه: باقي {minutes} دقيقة على خروج {studentName} من المدرسة',
    // إشعارات تغيير الحالة
    'status_title': 'تحديث حالة ابنك',
    'status_body': 'التلميذ {name} أصبح {status}',
    // إشعارات عامة
    'general_title': '📢 إشعار من المدرسة',
    'private_title': '📩 إشعار خاص من المدرسة',
    'bulk_title': 'تحديث جماعي',
    // سجل الحضور
    'attendance_entry': 'دخول',
    'attendance_exit': 'خروج',
    'attendance_no_logs': 'لا توجد سجلات بعد',
    'attendance_old_logs': '📜 السجل السابق',
  },
  fr: {
    'leaving_title': '⏰ Alerte de sortie',
    'leaving_body': '⏰ Alerte : il reste {minutes} minutes avant la sortie de {studentName} de l\'école',
    'status_title': 'Mise à jour du statut de votre enfant',
    'status_body': 'L\'étudiant {name} est {status}',
    'general_title': '📢 Notification de l\'école',
    'private_title': '📩 Notification privée de l\'école',
    'bulk_title': 'Mise à jour collective',
    'attendance_entry': 'Entrée',
    'attendance_exit': 'Sortie',
    'attendance_no_logs': 'Aucun enregistrement',
    'attendance_old_logs': '📜 Anciens enregistrements',
  },
};

function translate(lang, key, params = {}) {
  const langTranslations = translations[lang] || translations['ar'];
  let text = langTranslations[key] || key;
  for (const [paramKey, paramValue] of Object.entries(params)) {
    text = text.replace(`{${paramKey}}`, paramValue);
  }
  return text;
}

module.exports = { translate };
