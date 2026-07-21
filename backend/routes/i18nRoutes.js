const express = require('express');
const router = express.Router();
const i18n = require('../utils/i18n');

// جلب الترجمات للغة محددة
router.get('/:lang', (req, res) => {
  const { lang } = req.params;
  const translations = i18n.getTranslations(lang);
  res.json(translations);
});

// جلب اللغات المدعومة
router.get('/languages', (req, res) => {
  res.json(i18n.getLanguages());
});

module.exports = router;
