// ==========================================
// نظام الترجمة (i18n) - النسخة المستقرة
// ==========================================

const translations = {};

// تحميل ملفات الترجمة
async function loadTranslations() {
    try {
        const arRes = await fetch('/locales/ar.json');
        const frRes = await fetch('/locales/fr.json');
        
        if (!arRes.ok || !frRes.ok) {
            throw new Error('فشل تحميل ملفات الترجمة');
        }
        
        translations.ar = await arRes.json();
        translations.fr = await frRes.json();
        
        console.log('✅ تم تحميل الترجمات بنجاح');
        return true;
    } catch (err) {
        console.error('❌ خطأ في تحميل الترجمات:', err);
        return false;
    }
}

// الحصول على ترجمة
function t(key, lang = 'ar', params = {}) {
    const keys = key.split('.');
    let value = translations[lang];
    
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            // إذا لم يتم العثور على الترجمة، نستخدم العربية
            let fallback = translations.ar;
            for (const k2 of keys) {
                if (fallback && fallback[k2] !== undefined) {
                    fallback = fallback[k2];
                } else {
                    return key;
                }
            }
            value = fallback;
            break;
        }
    }
    
    if (typeof value === 'string') {
        for (const [paramKey, paramValue] of Object.entries(params)) {
            value = value.replace(`{${paramKey}}`, paramValue);
        }
    }
    return value;
}

// تبديل اللغة
let currentLanguage = localStorage.getItem('language') || 'ar';

function switchLanguage(lang) {
    if (lang === currentLanguage) return;
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    applyTranslations();
    // تحديث اتجاه الصفحة
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    // تحديث الأزرار النشطة
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

// تطبيق الترجمات على جميع العناصر
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key, currentLanguage);
        if (translation && translation !== key) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else if (el.tagName === 'SELECT') {
                // نتعامل مع الـ select بشكل منفصل
            } else {
                el.textContent = translation;
            }
        }
    });
}

// دالة لترجمة النصوص الديناميكية (للاستخدام في JavaScript)
function translate(key, params = {}) {
    return t(key, currentLanguage, params);
}
