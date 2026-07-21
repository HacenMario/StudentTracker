const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'لا يوجد توكن، وصول ممنوع' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'توكن غير صالح' });
  }
};

// Middleware للتحقق من المدير العام
module.exports.isSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'غير مصرح به، هذه الصلاحية مخصصة للمدير العام فقط' });
  }
  next();
};

// Middleware للتحقق من مدير المؤسسة
module.exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'غير مصرح به، هذه الصلاحية مخصصة للمدير فقط' });
  }
  next();
};
