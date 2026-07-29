// backend/utils/i18n.js
const translations = {
  ar: {
    'leave.approved': 'تمت الموافقة ✅',
    'leave.rejected': 'تم الرفض ❌',
    'leave.new_request': '📩 طلب عذر غياب جديد من {student}',
    'leave.updated': '📩 طلب عذر {student}: {status}',
    'leaving_title': '⏰ تنبيه الخروج',
    'leaving_body': '⏰ تنبيه: باقي {minutes} دقيقة على خروج {studentName} من المدرسة',
    'status_title': 'تحديث حالة ابنك',
    'status_body': 'التلميذ {name} أصبح {status}',
    'general_title': '📢 إشعار من المدرسة',
    'private_title': '📩 إشعار خاص من المدرسة',
    'bulk_title': 'تحديث جماعي',
    'attendance.entry': 'دخول',
    'attendance.exit': 'خروج',
    'attendance.no_logs': 'لا توجد سجلات بعد',
    'attendance.old_logs': '📜 السجل السابق',
    'attendance.student_became': 'التلميذ {name} أصبح {status}',
    'attendance.student_added': 'تم إضافة الطالب {name}',
    'attendance.student_updated': 'تم تعديل الطالب {name}',
    'attendance.student_deleted': 'تم حذف طالب',
    'attendance.student_toggled': 'تم تغيير حالة الطالب',
    'attendance.all_students_inside': 'تم تغيير حالة جميع الطلاب إلى داخل 🏫',
    'attendance.all_students_outside': 'تم تغيير حالة جميع الطلاب إلى خارج 🚪',
    'common.time': 'وقت:',
  },
  fr: {
    'leave.approved': 'Approuvée ✅',
    'leave.rejected': 'Rejetée ❌',
    'leave.new_request': '📩 Nouvelle demande d\'excuse de {student}',
    'leave.updated': '📩 Demande d\'excuse {student}: {status}',
    'leaving_title': '⏰ Alerte de sortie',
    'leaving_body': '⏰ Alerte : il reste {minutes} minutes avant la sortie de {studentName} de l\'école',
    'status_title': 'Mise à jour du statut de votre enfant',
    'status_body': 'L\'étudiant {name} est {status}',
    'general_title': '📢 Notification de l\'école',
    'private_title': '📩 Notification privée de l\'école',
    'bulk_title': 'Mise à jour collective',
    'attendance.entry': 'Entrée',
    'attendance.exit': 'Sortie',
    'attendance.no_logs': 'Aucun enregistrement',
    'attendance.old_logs': '📜 Anciens enregistrements',
    'attendance.student_became': 'L\'étudiant {name} est {status}',
    'attendance.student_added': 'Étudiant {name} ajouté',
    'attendance.student_updated': 'Étudiant {name} modifié',
    'attendance.student_deleted': 'Étudiant supprimé',
    'attendance.student_toggled': 'Statut de l\'étudiant modifié',
    'attendance.all_students_inside': 'Tous les étudiants sont à l\'intérieur 🏫',
    'attendance.all_students_outside': 'Tous les étudiants sont à l\'extérieur 🚪',
    'common.time': 'Heure :',
  },
  en: {
    'leave.approved': 'Approved ✅',
    'leave.rejected': 'Rejected ❌',
    'leave.new_request': '📩 New leave request from {student}',
    'leave.updated': '📩 Leave request {student}: {status}',
    'leaving_title': '⏰ Leaving Alert',
    'leaving_body': '⏰ Alert: {minutes} minutes until {studentName} leaves school',
    'status_title': 'Your Child\'s Status Update',
    'status_body': 'Student {name} is {status}',
    'general_title': '📢 School Notification',
    'private_title': '📩 Private Notification from School',
    'bulk_title': 'Bulk Update',
    'attendance.entry': 'Check In',
    'attendance.exit': 'Check Out',
    'attendance.no_logs': 'No records',
    'attendance.old_logs': '📜 Old records',
    'attendance.student_became': 'Student {name} is {status}',
    'attendance.student_added': 'Student {name} added',
    'attendance.student_updated': 'Student {name} updated',
    'attendance.student_deleted': 'Student deleted',
    'attendance.student_toggled': 'Student status changed',
    'attendance.all_students_inside': 'All students are inside 🏫',
    'attendance.all_students_outside': 'All students are outside 🚪',
    'common.time': 'Time:',
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
