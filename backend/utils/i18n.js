const fs = require('fs');
const path = require('path');

class I18n {
  constructor() {
    this.locales = {};
    this.supportedLanguages = ['ar', 'en', 'fr'];
    this.loadLocales();
  }

  loadLocales() {
    const localesDir = path.join(__dirname, '../locales');
    for (const lang of this.supportedLanguages) {
      try {
        const filePath = path.join(localesDir, `${lang}.json`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          this.locales[lang] = JSON.parse(content);
        } else {
          console.warn(`⚠️ ملف اللغة ${lang}.json غير موجود`);
        }
      } catch (err) {
        console.error(`❌ خطأ في تحميل ملف اللغة ${lang}:`, err);
      }
    }
  }

  translate(lang, key, params = {}) {
    const locale = this.locales[lang] || this.locales['ar'];
    const keys = key.split('.');
    let value = locale;
    for (const k of keys) {
      if (value && value[k] !== undefined) {
        value = value[k];
      } else {
        // إذا لم يتم العثور على الترجمة، نبحث في العربية
        const arabic = this.locales['ar'];
        let fallback = arabic;
        for (const k2 of keys) {
          if (fallback && fallback[k2] !== undefined) {
            fallback = fallback[k2];
          } else {
            fallback = key;
          }
        }
        value = fallback;
        break;
      }
    }
    
    // استبدال المتغيرات
    if (typeof value === 'string') {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(`{${paramKey}}`, paramValue);
      }
    }
    return value;
  }

  getTranslations(lang) {
    return this.locales[lang] || this.locales['ar'];
  }

  getLanguages() {
    return this.supportedLanguages.map(code => ({
      code,
      name: this.translate('common', `language.${code}`) || code,
    }));
  }
}

module.exports = new I18n();
