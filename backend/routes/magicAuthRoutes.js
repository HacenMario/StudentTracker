// backend/routes/magicAuthRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ==========================================
// إعداد البريد الإلكتروني (SMTP)
// ==========================================
// استخدم إعدادات Gmail (أو أي مزود آخر)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==========================================
// 1. طلب رابط سحري
// ==========================================
router.post('/magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'البريد الإلكتروني مطلوب' });
    }

    // البحث عن المستخدم
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'البريد الإلكتروني غير مسجل في النظام' });
    }

    // توليد توكن عشوائي
    const token = crypto.randomBytes(32).toString('hex');
    user.magicToken = token;
    user.magicTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 دقيقة
    await user.save();

    // رابط السحري
    const frontendUrl = process.env.FRONTEND_URL || 'https://student-tracker-six-alpha.vercel.app';
    const magicLink = `${frontendUrl}/magic-login/${token}`;

    // إرسال البريد الإلكتروني
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🔐 رابط الدخول السحري - نظام الحضور المدرسي',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; direction: rtl;">
          <h2 style="color: #1a365d;">مرحباً ${user.name} 👋</h2>
          <p style="font-size: 16px; color: #4a5a6e;">
            تم طلب رابط دخول سحري لحسابك في <strong>نظام الحضور المدرسي</strong>.
          </p>
          <p style="font-size: 14px; color: #4a5a6e;">
            هذا الرابط صالح لمدة <strong>15 دقيقة</strong> فقط.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" 
               style="background: linear-gradient(135deg, #2b6cb0, #1a365d); 
                      color: white; 
                      padding: 14px 40px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-size: 18px;
                      font-weight: 600;
                      display: inline-block;">
              🔐 تسجيل الدخول الآن
            </a>
          </div>
          <p style="font-size: 14px; color: #8a9aaa;">
            إذا لم تطلب هذا الرابط، يمكنك تجاهل هذه الرسالة.
          </p>
          <hr style="border: 1px solid #e2eaf2; margin: 20px 0;">
          <p style="font-size: 12px; color: #8a9aaa; text-align: center;">
            هذا بريد آلي، يرجى عدم الرد على هذه الرسالة.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: '✅ تم إرسال رابط الدخول السحري إلى بريدك الإلكتروني',
    });

  } catch (err) {
    console.error('❌ خطأ في إرسال الرابط السحري:', err);
    res.status(500).json({ 
      success: false,
      message: 'فشل إرسال الرابط السحري. يرجى المحاولة مرة أخرى.',
      error: err.message,
    });
  }
});

// ==========================================
// 2. التحقق من الرابط السحري وتسجيل الدخول
// ==========================================
router.get('/magic-login/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // البحث عن المستخدم باستخدام التوكن
    const user = await User.findOne({
      magicToken: token,
      magicTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ 
        message: 'الرابط غير صالح أو منتهي الصلاحية (15 دقيقة)',
      });
    }

    // تنظيف التوكن (استخدامه لمرة واحدة)
    user.magicToken = null;
    user.magicTokenExpiry = null;
    await user.save();

    // إنشاء JWT
    const jwtToken = jwt.sign(
      { 
        email: user.email, 
        name: user.name, 
        role: user.role, 
        id: user._id,
        tenantId: user.tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // إعادة توجيه إلى الواجهة الأمامية مع التوكن
    const frontendUrl = process.env.FRONTEND_URL || 'https://student-tracker-six-alpha.vercel.app';
    const userData = encodeURIComponent(JSON.stringify({
      name: user.name,
      email: user.email,
      role: user.role,
    }));

    res.redirect(`${frontendUrl}/?token=${jwtToken}&user=${userData}`);

  } catch (err) {
    console.error('❌ خطأ في التحقق من الرابط السحري:', err);
    res.status(500).json({ 
      message: 'حدث خطأ أثناء تسجيل الدخول',
      error: err.message,
    });
  }
});

module.exports = router;
