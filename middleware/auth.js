const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // جلب التوكن من الـ header
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'لا يوجد توكن، وصول ممنوع' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // يحتوي على { email, name, ... }
    next();
  } catch (err) {
    res.status(401).json({ message: 'توكن غير صالح' });
  }
};
