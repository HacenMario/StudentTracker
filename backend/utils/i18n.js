// backend/utils/i18n.js
// نظام ترجمة بسيط للإشعارات

// تعريف الترجمات
const translations = {
  ar: {
    '⏰ تنبيه الخروج': '⏰ تنبيه الخروج',
    '⏰ تنبيه: باقي {minutes} دقيقة على خروج {studentName} من المدرسة': '⏰ تنبيه: باقي {minutes} دقيقة على خروج {studentName} من المدرسة',
    'تحديث حالة ابنك': 'تحديث حالة ابنك',
    'التلميذ {name} أصبح {status}': 'التلميذ {name} أصبح {status}',
    '📢 إشعار من المدرسة': '📢 إشعار من المدرسة',
    '📩 إشعار خاص من المدرسة': '📩 إشعار خاص من المدرسة',
    'تحديث جماعي': 'تحديث جماعي',
  },
  fr: {
    '⏰ تنبيه الخروج': '⏰ Alerte de sortie',
    '⏰ تنبيه: باقي {minutes} دقيقة على خروج {studentName} من المدرسة': '⏰ Alerte : il reste {minutes} minutes avant la sortie de {studentName} de l\'école',
    'تحديث حالة ابنك': 'Mise à jour du statut de votre enfant',
    'التلميذ {name} أصبح {status}': 'L\'étudiant {name} est {status}',
    '📢 إشعار من المدرسة': '📢 Notification de l\'école',
    '📩 إشعار خاص من المدرسة': '📩 Notification privée de l\'école',
    'تحديث جماعي': 'Mise à jour collective',
  },
};

function translate(lang, key, params = {}) {
  // الحصول على ترجمة النص
  let translation = translations[lang]?.[key] || translations['ar'][key] || key;
  
  // استبدال المتغيرات إن وجدت
  for (const [paramKey, paramValue] of Object.entries(params)) {
    translation = translation.replace(`{${paramKey}}`, paramValue);
  }
  
  return translation;
}

module.exports = { translate };
