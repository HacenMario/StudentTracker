const multer = require('multer');
const path = require('path');
const fs = require('fs');

// التأكد من وجود المجلد المخصص للصور، وإنشاؤه إذا لم يكن موجوداً
const uploadDir = 'public/uploads/students';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// تحديد كيفية تخزين الملف
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // المجلد الذي سيتم الحفظ فيه
  },
  filename: (req, file, cb) => {
    // إنشاء اسم فريد للملف: الوقت الحالي + رقم عشوائي + الامتداد الأصلي
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'student-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// فلترة الملفات: السماح فقط بالصور
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('يُسمح فقط بملفات الصور (jpg, png, gif, etc.)'), false);
  }
};

// تهيئة Multer مع الإعدادات السابقة
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // الحد الأقصى 5 ميجابايت
});

module.exports = upload;
