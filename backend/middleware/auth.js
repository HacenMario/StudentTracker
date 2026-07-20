const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'لا يوجد توكن، وصول ممنوع' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { email, name, role, id }
    next();
  } catch (err) {
    res.status(401).json({ message: 'توكن غير صالح' });
  }
};

// Middleware للتحقق من صلاحية المدير
module.exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح به، هذه الصلاحية مخصصة للمدير فقط' });
  }
  next();
};
