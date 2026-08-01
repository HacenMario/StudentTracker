// ====================================
// 1. رابط الخادم
// ====================================
const API_BASE_URL = 'https://studenttracker-ib8y.onrender.com';
const SOCKET_URL = API_BASE_URL;
const vapidPublicKey = 'BF7IlardTlVn6X4dNtcTad2ixM09jH87Q-vKyo5ScWY9uzLw3y-goXcgPmC8gxBpFWIGVgFWKxwC2pTDXNYnlD4';

// ==========================================
// 2. إدارة التوكن والمستخدم والمتغيرات العامة
// ==========================================
let token = localStorage.getItem('token');
let currentUser = null;
let socket = null;
let schoolSettings = null;
let allNotifications = [];
let showOldNotifications = false;
let adminShowOldLogs = false;
let parentShowOldLogs = false;
let adminLogs = [];
let parentLogs = [];

// متغيرات الماسح الضوئي
let html5QrCode = null;
let currentCameraId = null;
let availableCameras = [];

// متغيرات البحث
let allStudents = [];
let searchQuery = '';

// ==========================================
// زر تغيير اللغة - التحديث لجميع الشاشات
// ==========================================

// تحديث حالة الأزرار النشطة لكل الشاشات
function updateLanguageButtons(lang) {
    // تحديث أزرار شاشة تسجيل الدخول
    document.querySelectorAll('#loginScreen .lang-btn, #registerScreen .lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    // تحديث أزرار الهيدر في اللوحات
    document.querySelectorAll('.header-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

// تحديث دالة switchLanguage
function switchLanguage(lang) {
    if (lang === currentLanguage) return;
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    // تحديث الاتجاه
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    
    // ✅ تحديث حالة جميع الأزرار
    updateLanguageButtons(lang);
    
    // تطبيق الترجمات
    applyTranslationsToAll();
    
    // إعادة تحميل المحتوى الديناميكي
    if (currentUser) {
        if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
            loadAdminStudents();
            loadAdminLogs();
            loadAdminNotifications();
        } else {
            loadParentStudents();
            loadParentLogs();
            loadParentNotifications();
        }
    }
    
    console.log(`🌍 تم تغيير اللغة إلى: ${lang}`);
}

// ==========================================
// نظام الترجمة (i18n)
// ==========================================
let currentLanguage = localStorage.getItem('language') || 'ar';
let translationsLoaded = false;

// تحميل الترجمات
async function loadTranslations() {
    try {
        const arRes = await fetch('/locales/ar.json');
        const frRes = await fetch('/locales/fr.json');
        const enRes = await fetch('/locales/en.json');
        
        if (!arRes.ok || !frRes.ok) {
            throw new Error('فشل تحميل ملفات الترجمة');
        }
        
        window.translations = {
            ar: await arRes.json(),
            fr: await frRes.json(),
            en: await enRes.json()
        };
        
        translationsLoaded = true;
        console.log('✅ تم تحميل الترجمات بنجاح');
        return true;
    } catch (err) {
        console.error('❌ خطأ في تحميل الترجمات:', err);
        return false;
    }
}

// دالة الترجمة
function t(key, params = {}) {
    if (!translationsLoaded || !window.translations) {
        return key;
    }
    
    const lang = currentLanguage;
    const keys = key.split('.');
    let value = window.translations[lang];
    
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            let fallback = window.translations.ar;
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
    return value || key;
}

// تبديل اللغة
function switchLanguage(lang) {
    if (lang === currentLanguage) return;
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    applyTranslationsToAll();
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    document.querySelectorAll('.header-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    // تحديث حالة الأزرار في كل مكان
    updateLanguageButtons(lang);
    console.log(`🌍 تم تغيير اللغة إلى: ${lang}`);
}

// تطبيق الترجمات على جميع العناصر
function applyTranslationsToAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (translation && translation !== key) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        }
    });
    updateDynamicTexts();
}

// تحديث النصوص الديناميكية
function updateDynamicTexts() {
    // زر تسجيل الدخول
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        const text = t('auth.login');
        if (text && text !== 'auth.login') {
            loginBtn.innerHTML = `${text} <i class="fas fa-arrow-left"></i>`;
        }
    }
    
    // زر التسجيل
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        const text = t('auth.register');
        if (text && text !== 'auth.register') {
            registerBtn.innerHTML = `${text} <i class="fas fa-user-plus"></i>`;
        }
    }
    
    // زر إضافة طالب
    const addBtn = document.getElementById('adminAddBtn');
    if (addBtn) {
        const text = t('student.save');
        if (text && text !== 'student.save') {
            addBtn.innerHTML = `<i class="fas fa-save"></i> ${text}`;
        }
    }
    
    // زر حفظ الإعدادات
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        const text = t('settings.save');
        if (text && text !== 'settings.save') {
            saveSettingsBtn.innerHTML = `<i class="fas fa-save"></i> ${text}`;
        }
    }
}

// دالة مساعدة للترجمة في JavaScript
function translate(key, params = {}) {
    return t(key, params);
}

// ==========================================
// 3. دوال مساعدة
// ==========================================
function getStatusText(isInside) {
    return isInside ? 'داخل 🏫' : 'خارج 🚪';
}
function getStatusClass(isInside) {
    return isInside ? 'inside' : 'outside';
}

function formatFullTime(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return dateString;
    }

    // عرض الوقت بتوقيت الجزائر (UTC+1) بغض النظر عن توقيت المتصفح
    const options = {
        timeZone: 'Africa/Algiers',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    };
    const formatter = new Intl.DateTimeFormat('fr-CA', options);
    const parts = formatter.formatToParts(date);
    
    const getPart = (type) => parts.find(p => p.type === type)?.value || '';
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function isToday(dateString) {
    const today = new Date();
    const date = new Date(dateString);
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
}

function showBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://img.icons8.com/color/96/school.png' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// ==========================================
// 4. نافذة التأكيد (Modal)
// ==========================================
let modalResolve = null;

function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('confirmModal').style.display = 'flex';
        modalResolve = resolve;
    });
}

document.getElementById('modalConfirmBtn').addEventListener('click', function() {
    document.getElementById('confirmModal').style.display = 'none';
    if (modalResolve) modalResolve(true);
});

document.getElementById('modalCancelBtn').addEventListener('click', function() {
    document.getElementById('confirmModal').style.display = 'none';
    if (modalResolve) modalResolve(false);
});

// ==========================================
// 5. دوال المصادقة
// ==========================================
function saveAuth(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    
    if (currentUser) {
        setTimeout(() => {
            requestNotificationPermission();
        }, 1500);
    }

    if (currentUser.role === 'admin') {
        showAdminDashboard();
    } else {
        showParentDashboard();
    }
}

function logout() {
    unsubscribeFromPush()
        .then(() => {
            console.log('✅ تم إلغاء الاشتراك بنجاح');
        })
        .catch(err => {
            console.warn('⚠️ فشل إلغاء الاشتراك (غير حرج):', err);
        })
        .finally(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            token = null;
            currentUser = null;
            if (socket) { socket.disconnect(); socket = null; }
            closeScanner();
            showLogin();
        });
}

function showLogin() {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('parentDashboard').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('parentDashboard').style.display = 'none';
}

function showAdminDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('parentDashboard').style.display = 'none';
    connectSocket();
    loadSchoolSettings();
    loadAdminStudents();
    loadAdminLogs();
    loadAdminNotifications();
    
    // ✅ ربط أحداث Socket للإجازات
    setupLeaveSocketEvents();
    
    // ✅ تحميل طلبات الإجازات
    loadLeaveRequests().then(requests => {
        renderLeaveRequests(requests, 'leaveRequestsList');
    });
    
    // ✅ إضافة أحداث العطل عند عرض لوحة المدير
    setupHolidayEvents();
}

function showParentDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('parentDashboard').style.display = 'block';

    // ✅ جلب بيانات ولي الأمر من API مباشرة (من الطلاب المرتبطين به)
    fetchParentInfo();

    connectSocket();
    loadParentStudents(); // تحميل قائمة الطلاب
    loadParentLogs();
    loadParentNotifications();
    loadParentChildren(); // تعبئة القائمة المنسدلة
    setupParentMessageForm();
    loadParentSmartAlerts();
}

// دالة جديدة لجلب معلومات ولي الأمر وعرضها
async function fetchParentInfo() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        // جلب قائمة الطلاب من API (لأنها تحتوي على معلومات ولي الأمر)
        const response = await fetch(API_BASE_URL + '/api/students', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('فشل في جلب بيانات الطلاب');
        const students = await response.json();

        // إذا كان هناك طلاب، نأخذ معلومات أول طالب (جميعهم لديهم نفس بيانات ولي الأمر)
        if (students.length > 0) {
            const firstStudent = students[0];
            document.getElementById('parentNameDisplay').textContent = firstStudent.parentName || 'غير معروف';
            document.getElementById('parentEmailDisplay').textContent = firstStudent.parentEmail || 'غير معروف';
            document.getElementById('parentPhoneDisplay').textContent = firstStudent.parentPhone || 'غير معروف';
        } else {
            // إذا لم يكن هناك طلاب، نعرض رسالة
            document.getElementById('parentNameDisplay').textContent = 'لا يوجد أبناء مسجلين';
            document.getElementById('parentEmailDisplay').textContent = '---';
            document.getElementById('parentPhoneDisplay').textContent = '---';
        }
    } catch (error) {
        console.error('خطأ في جلب معلومات ولي الأمر:', error);
        // عرض رسائل افتراضية في حال حدوث خطأ
        document.getElementById('parentNameDisplay').textContent = 'حدث خطأ في التحميل';
        document.getElementById('parentEmailDisplay').textContent = '---';
        document.getElementById('parentPhoneDisplay').textContent = '---';
    }
}

// ✅ دالة جديدة لتحميل التنبيهات الذكية الخاصة بولي الأمر
async function loadParentSmartAlerts() {
    try {
        const res = await fetchWithAuth('/api/smart-alerts');
        if (!res.ok) throw new Error('فشل جلب التنبيهات');
        const alerts = await res.json();
        renderSmartAlerts(alerts, 'parentSmartAlertsList');
    } catch (err) {
        console.error('❌ خطأ في تحميل التنبيهات الذكية لولي الأمر:', err);
        const container = document.getElementById('parentSmartAlertsList');
        if (container) {
            container.innerHTML = `<div class="log-item" style="color:#8a9aaa; justify-content:center; padding:12px;">${translate('smart_alerts.no_alerts')}</div>`;
        }
    }
}

// ==========================================
// 6. Socket.io
// ==========================================
function connectSocket() {
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(SOCKET_URL, { auth: { token } });

    socket.on('connect', () => console.log('✅ Socket متصل'));

socket.on('status-changed', (data) => {
    console.log('📢 استقبال حدث status-changed:', data);

    if (currentUser.role === 'admin') {
        loadAdminStudents();
        const statusText = data.student?.isInside ? translate('student.inside') : translate('student.outside');
        const displayMessage = data.student 
            ? translate('attendance.student_became', { name: data.student.name, status: statusText })
            : data.message || translate('attendance.status_updated');

        const correctedDate = new Date();
        const logEntry = {
            message: displayMessage,
            time: formatFullTime(correctedDate),
            date: correctedDate,
            key: data.student ? 'attendance.student_became' : null,
            params: data.student ? { name: data.student.name, status: statusText } : {}
        };
        adminLogs.unshift(logEntry);
        renderAdminLogs(adminShowOldLogs);
        loadAdminLogs();
    } else {
        // ✅ معالجة التغيير الجماعي (isBulk)
        if (data.isBulk) {
            // إعادة تحميل جميع بيانات الأبناء وسجل الحضور
            loadParentStudents(); // هذه الدالة تقوم بتحديث parentLogs
            showBrowserNotification(translate('notification.title'), data.message || 'تم تحديث حالة الطلاب');
            return;
        }

        // التحقق من أن الإشعار يخص ولي الأمر الحالي (للتغييرات الفردية)
        if (data.parentEmail === currentUser.email || data.parentId === currentUser.id) {
            loadParentStudents();
            const statusText = data.student.isInside ? translate('student.inside') : translate('student.outside');
            const displayMessage = translate('attendance.student_became', { 
                name: data.student.name, 
                status: statusText 
            });

            const logEntry = {
                message: displayMessage,
                time: formatFullTime(new Date()),
                date: new Date(),
                key: 'attendance.student_became',
                params: { name: data.student.name, status: statusText },
                studentName: data.student.name
            };
            parentLogs.unshift(logEntry);
            renderParentLogs(parentShowOldLogs);
            showBrowserNotification(translate('notification.title'), displayMessage);
        }
    }
});
    
    socket.on('notification', (data) => {
        if (currentUser.role === 'parent') {
            const newNotification = {
                message: data.message,
                createdAt: data.createdAt || new Date().toISOString(),
                isRead: false,
                _id: data.notificationId || 'temp_' + Date.now()
            };
            allNotifications.unshift(newNotification);
            renderNotifications(showOldNotifications);
            showBrowserNotification('📢 إشعار من المدرسة', data.message);
        } else if (currentUser.role === 'admin') {
            loadAdminLogs();
        }
    });

    socket.on('notification-error', (data) => {
        alert(data.message);
    });

    socket.on('notification-sent', (data) => {
        loadAdminLogs();
    });

    socket.on('disconnect', () => console.warn('⚠️ انقطع الاتصال'));
}

// ==========================================
// 7. دوال API مع التوكن
// ==========================================
function fetchWithAuth(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    } else {
        console.warn('⚠️ fetchWithAuth: لا يوجد توكن');
        return Promise.reject(new Error('لا يوجد توكن للمصادقة'));
    }

    return fetch(API_BASE_URL + url, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
}

// ==========================================
// 8. دوال إعدادات المدرسة
// ==========================================
async function loadSchoolSettings() {
    try {
        const res = await fetch(API_BASE_URL + '/api/settings');
        if (!res.ok) throw new Error('فشل جلب إعدادات المدرسة');
        schoolSettings = await res.json();
        applySchoolSettings();
    } catch (err) {
        console.error(err);
    }
}

function applySchoolSettings() {
    if (!schoolSettings) return;
    document.getElementById('schoolName').textContent = schoolSettings.schoolName || 'إبتدائية عقبة بن نافع';
    document.getElementById('schoolAddress').textContent = '📍 ' + (schoolSettings.address || 'العنوان غير محدد');
    document.getElementById('schoolContact').textContent = '📞 ' + (schoolSettings.phone || '') + ' | ✉️ ' + (schoolSettings.email || '');
    
    const logoImg = document.getElementById('schoolLogo');
    if (schoolSettings.logo && schoolSettings.logo.length > 0) {
        logoImg.src = schoolSettings.logo;
        logoImg.style.display = 'inline-block';
    } else {
        logoImg.style.display = 'none';
    }

    if (currentUser && currentUser.role === 'admin') {
        document.getElementById('settingsSchoolName').value = schoolSettings.schoolName || '';
        document.getElementById('settingsAddress').value = schoolSettings.address || '';
        document.getElementById('settingsPhone').value = schoolSettings.phone || '';
        document.getElementById('settingsEmail').value = schoolSettings.email || '';
        document.getElementById('settingsEndTime').value = schoolSettings.schoolEndTime || '16:00';
        document.getElementById('settingsNotifyBefore').value = schoolSettings.notificationBeforeMinutes || 30;
        const preview = document.getElementById('logoPreview');
        if (schoolSettings.logo) {
            preview.innerHTML = `<img src="${schoolSettings.logo}" alt="الشعار الحالي">`;
        } else {
            preview.innerHTML = '<span style="color:#8a9aaa;">لا يوجد شعار حالياً</span>';
        }
    }
}

async function saveSchoolSettings() {
    const schoolName = document.getElementById('settingsSchoolName').value.trim();
    const address = document.getElementById('settingsAddress').value.trim();
    const phone = document.getElementById('settingsPhone').value.trim();
    const email = document.getElementById('settingsEmail').value.trim();
    const schoolEndTime = document.getElementById('settingsEndTime').value || '16:00';
    const notificationBeforeMinutes = parseInt(document.getElementById('settingsNotifyBefore').value) || 30;

    
    let logo = schoolSettings ? schoolSettings.logo : '';
    let logoFileName = schoolSettings ? schoolSettings.logoFileName : '';
    
    const fileInput = document.getElementById('settingsLogoUpload');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        logo = base64;
        logoFileName = file.name;
    }

    const confirmed = await showConfirmModal(
        translate('settings.save'),
        translate('settings.confirm')
    );
    if (!confirmed) return;

    try {
        const res = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ schoolName, address, phone, email, logo, logoFileName, schoolEndTime, notificationBeforeMinutes, })
        });
        if (!res.ok) throw new Error(translate('common.error'));
        const data = await res.json();
        schoolSettings = data;
        applySchoolSettings();
        alert(translate('settings.success'));
        document.getElementById('settingsForm').style.display = 'none';
        document.getElementById('toggleSettingsBtn').innerHTML = `<i class="fas fa-cog"></i> ${translate('settings.school')}`;
    } catch (err) {
        alert(translate('common.error'));
    }
}

function toggleSettingsForm() {
    const form = document.getElementById('settingsForm');
    const btn = document.getElementById('toggleSettingsBtn');
    if (!form || !btn) return;
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerHTML = `<i class="fas fa-times"></i> ${translate('settings.close')}`;
        if (schoolSettings) {
            document.getElementById('settingsSchoolName').value = schoolSettings.schoolName || '';
            document.getElementById('settingsAddress').value = schoolSettings.address || '';
            document.getElementById('settingsPhone').value = schoolSettings.phone || '';
            document.getElementById('settingsEmail').value = schoolSettings.email || '';
            const preview = document.getElementById('logoPreview');
            if (schoolSettings.logo) {
                preview.innerHTML = `<img src="${schoolSettings.logo}" alt="الشعار الحالي">`;
            } else {
                preview.innerHTML = '<span style="color:#8a9aaa;">لا يوجد شعار حالياً</span>';
            }
        }
    } else {
        form.style.display = 'none';
        btn.innerHTML = `<i class="fas fa-cog"></i> ${translate('settings.school')}`;
    }
}

document.getElementById('settingsLogoUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const preview = document.getElementById('logoPreview');
            preview.innerHTML = `<img src="${event.target.result}" alt="الشعار الجديد">`;
        };
        reader.readAsDataURL(file);
    }
});

// ==========================================
// 9. دوال QR Code
// ==========================================
window.downloadQR = function(studentId) {
    fetchWithAuth('/api/students/' + studentId + '/qr')
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || 'فشل التحميل'); });
            }
            return res.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `QR_${studentId}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(err => alert('فشل تحميل QR: ' + err.message));
};

function openScanner() {
    const modal = document.getElementById('scannerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = `📷 ${translate('qr.accessing_camera')}`;

    if (typeof Html5Qrcode === 'undefined') {
        resultsContainer.innerHTML = '❌ مكتبة المسح غير محملة، تحقق من اتصال الإنترنت.';
        return;
    }

    if (html5QrCode) {
        html5QrCode.stop()
            .then(() => {
                html5QrCode.clear();
                html5QrCode = null;
                startScannerProcess();
            })
            .catch(() => {
                html5QrCode = null;
                startScannerProcess();
            });
    } else {
        startScannerProcess();
    }
}

function startScannerProcess() {
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = translate('scanner.accessing');

    html5QrCode = new Html5Qrcode('qr-reader');

    Html5Qrcode.getCameras()
        .then(devices => {
            if (devices && devices.length > 0) {
                availableCameras = devices;
                let selectedCamera = devices[0];
                const backCamera = devices.find(d => {
                    const label = d.label.toLowerCase();
                    return label.includes('back') || label.includes('rear') || 
                           label.includes('environment') || label.includes('خلفية');
                });
                if (backCamera) {
                    selectedCamera = backCamera;
                } else {
                    const nonFront = devices.find(d => {
                        const label = d.label.toLowerCase();
                        return !label.includes('front') && !label.includes('selfie') && 
                               !label.includes('أمامية');
                    });
                    if (nonFront) selectedCamera = nonFront;
                }

                currentCameraId = selectedCamera.id;
                resultsContainer.innerHTML = `✅ تم اختيار الكاميرا: ${selectedCamera.label || 'غير معروف'}`;
                
                const switchBtn = document.getElementById('switchCameraBtn');
                if (devices.length > 1) {
                    switchBtn.style.display = 'inline-block';
                } else {
                    switchBtn.style.display = 'none';
                }

                startNewScanner(currentCameraId);
            } else {
                resultsContainer.innerHTML = '❌ لا توجد كاميرات متاحة على هذا الجهاز.';
            }
        })
        .catch(err => {
            console.error('خطأ في الوصول للكاميرات:', err);
            if (err.message && err.message.includes('Permission')) {
                resultsContainer.innerHTML = '❌ تم رفض إذن الكاميرا. يرجى السماح بالوصول إلى الكاميرا في إعدادات المتصفح.';
            } else {
                resultsContainer.innerHTML = `❌ فشل الوصول للكاميرا: ${err.message || 'خطأ غير معروف'}`;
            }
        });
}

function startNewScanner(cameraId) {
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = `⏳ ${translate('qr.starting_camera')}`;

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
    }

    html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        onScanError
    )
    .then(() => {
        if (resultsContainer) resultsContainer.innerHTML = `📸 ${translate('qr.camera_working')}`;
        currentCameraId = cameraId;
    })
    .catch(err => {
        console.error('فشل تشغيل الكاميرا:', err);
        if (resultsContainer) {
            resultsContainer.innerHTML = `❌ فشل تشغيل الكاميرا: ${err.message || 'خطأ غير معروف'}`;
            if (err.message && err.message.includes('NotAllowedError')) {
                resultsContainer.innerHTML = '❌ تم رفض إذن الكاميرا. يرجى السماح بالوصول في إعدادات المتصفح.';
            }
        }
    });
}

function switchCamera() {
    if (availableCameras.length < 2) {
        alert('لا توجد كاميرات أخرى');
        return;
    }

    const currentIndex = availableCameras.findIndex(d => d.id === currentCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextIndex];
    
    console.log('🔄 تبديل الكاميرا إلى:', nextCamera.label || 'غير معروف');
    
    if (html5QrCode) {
        html5QrCode.stop()
            .then(() => {
                html5QrCode.clear();
                html5QrCode = null;
                startScannerProcess();
            })
            .catch(() => {
                html5QrCode = null;
                startScannerProcess();
            });
    } else {
        startScannerProcess();
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const resultsContainer = document.getElementById('qr-reader-results');
    resultsContainer.innerHTML = '✅ جاري معالجة الكود...';

    if (html5QrCode) {
        html5QrCode.pause();
    }

    const cleanData = decodedText.trim();

    fetchWithAuth('/api/students/scan-qr', {
        method: 'POST',
        body: JSON.stringify({ qrData: cleanData })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            resultsContainer.innerHTML = '✅ ' + data.message;
            if (currentUser.role === 'admin') {
                loadAdminStudents();
                loadAdminLogs();
            } else {
                loadParentStudents();
                loadParentLogs();
            }
            setTimeout(closeScanner, 2000);
        } else {
            resultsContainer.innerHTML = '❌ ' + data.message;
            if (html5QrCode) html5QrCode.resume();
        }
    })
    .catch(err => {
        resultsContainer.innerHTML = '❌ خطأ في الاتصال بالخادم';
        console.error(err);
        if (html5QrCode) html5QrCode.resume();
    });
}

function onScanError(error) {
    // تجاهل الأخطاء العادية
}

function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop()
            .then(() => {
                html5QrCode.clear();
                html5QrCode = null;
            })
            .catch(err => {
                console.warn('خطأ في إيقاف الماسح:', err);
                html5QrCode = null;
            });
    }
    document.getElementById('scannerModal').style.display = 'none';
    document.getElementById('qr-reader-results').innerHTML = '';
    document.getElementById('switchCameraBtn').style.display = 'none';
}

document.getElementById('openScannerBtn').addEventListener('click', openScanner);
document.getElementById('closeScannerBtn').addEventListener('click', closeScanner);
document.getElementById('switchCameraBtn').addEventListener('click', switchCamera);

// ==========================================
// 10. دوال الإشعارات (Web Push)
// ==========================================
async function requestNotificationPermission() {
    if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Worker غير مدعوم');
        return false;
    }
    if (!('Notification' in window)) {
        console.warn('⚠️ هذا المتصفح لا يدعم الإشعارات');
        return false;
    }
    if (!currentUser) {
        console.warn('⚠️ لا يوجد مستخدم مسجل الدخول');
        return false;
    }

    if (Notification.permission === 'granted') {
        console.log('✅ الإذن موجود مسبقاً');
        await subscribeToPush();
        return true;
    }

    if (Notification.permission === 'denied') {
        console.warn('⚠️ تم رفض إذن الإشعارات مسبقاً');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('✅ تم منح الإذن');
            await subscribeToPush();
            return true;
        } else {
            console.warn('⚠️ تم رفض الإذن');
            return false;
        }
    } catch (err) {
        console.error('❌ خطأ في طلب الإذن:', err);
        return false;
    }
}

async function subscribeToPush() {
    try {
        if (!token) {
            token = localStorage.getItem('token');
            if (!token) {
                console.warn('⚠️ لا يوجد توكن لتسجيل الاشتراك');
                return null;
            }
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            console.log('✅ اشتراك موجود مسبقاً');
            await sendSubscriptionToServer(subscription);
            return subscription;
        }

const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey
});

        
        console.log('✅ اشتراك جديد تم إنشاؤه');
        await sendSubscriptionToServer(subscription);
        
        return subscription;
    } catch (err) {
        console.error('❌ فشل الاشتراك في Push:', err);
        return null;
    }
}

async function sendSubscriptionToServer(subscription) {
    try {
        const payload = {
            subscription: {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
                    auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))),
                },
            },
            userEmail: currentUser ? currentUser.email : null,
            role: currentUser ? currentUser.role : null,
        };

        const res = await fetchWithAuth('/api/subscriptions/subscribe', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (res.ok) {
            console.log('✅ تم تسجيل الاشتراك في الخادم');
        } else {
            const error = await res.json();
            console.warn('❌ فشل تسجيل الاشتراك:', error.message);
        }
    } catch (err) {
        console.error('❌ خطأ في إرسال الاشتراك:', err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function unsubscribeFromPush() {
    try {
        if (!token) {
            console.log('ℹ️ لا يوجد توكن، تخطي إلغاء الاشتراك');
            return;
        }
        if (!('serviceWorker' in navigator)) {
            return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            await subscription.unsubscribe();
            console.log('✅ تم إلغاء الاشتراك من Push');
            
            await fetchWithAuth('/api/subscriptions/unsubscribe', {
                method: 'DELETE',
                body: JSON.stringify({ endpoint: subscription.endpoint }),
            }).catch(err => console.warn('⚠️ فشل إعلام الخادم:', err));
        }
    } catch (err) {
        console.error('❌ فشل إلغاء الاشتراك:', err);
    }
}

// ==========================================
// 11. دوال الإشعارات (داخل التطبيق)
// ==========================================
async function loadAdminNotifications() {
    try {
        const res = await fetchWithAuth('/api/notifications');
        if (!res.ok) throw new Error('فشل جلب الإشعارات');
        const notifications = await res.json();
        notifications.forEach(n => {
            // ✅ استخدام التاريخ مباشرة بدون تصحيح
            const correctedDate = new Date(n.createdAt);
            addLog('📩 ' + n.message + ' (إلى: ' + n.target + ')', correctedDate, 'adminLogContainer');
        });
    } catch (err) {
        console.error(err);
    }
}

async function loadParentNotifications() {
    try {
        const res = await fetchWithAuth('/api/notifications');
        if (!res.ok) throw new Error('فشل جلب الإشعارات');
        allNotifications = await res.json();
        allNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderNotifications(showOldNotifications);
    } catch (err) {
        console.error(err);
    }
}

function renderNotifications(showOld) {
    const list = document.getElementById('notificationList');
    list.innerHTML = '';

    if (allNotifications.length === 0) {
        list.innerHTML = '<li style="color:#8a9aaa; text-align:center; padding:20px;">' + translate('notification.no_notifications') + '</li>';
        document.getElementById('showOldNotificationsBtn').style.display = 'none';
        document.getElementById('hideOldNotificationsBtn').style.display = 'none';
        return;
    }

    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    const recentCount = Math.max(unreadCount, 3);
    
    let newNotifications = [];
    let oldNotifications = [];

    if (showOld) {
        newNotifications = allNotifications;
        oldNotifications = [];
        document.getElementById('showOldNotificationsBtn').style.display = 'none';
        document.getElementById('hideOldNotificationsBtn').style.display = 'block';
    } else {
        newNotifications = allNotifications.slice(0, recentCount);
        oldNotifications = allNotifications.slice(recentCount);
        
        if (oldNotifications.length > 0) {
            document.getElementById('showOldNotificationsBtn').style.display = 'inline-flex';
            document.getElementById('hideOldNotificationsBtn').style.display = 'none';
        } else {
            document.getElementById('showOldNotificationsBtn').style.display = 'none';
            document.getElementById('hideOldNotificationsBtn').style.display = 'none';
        }
    }

    newNotifications.forEach(n => {
        // ✅ ترجمة رسالة الإشعار عند العرض
        let translatedMessage = translateNotificationMessage(n.message);
        addNotificationToUI(translatedMessage, n.createdAt, n.isRead, n._id);
    });

    if (showOld && oldNotifications.length > 0) {
        const divider = document.createElement('li');
        divider.style.cssText = 'border-top:2px dashed #ccc; margin:10px 0; padding:5px; text-align:center; color:#8a9aaa; font-size:13px;';
        divider.textContent = translate('notification.old');
        list.appendChild(divider);
        
        oldNotifications.forEach(n => {
            let translatedMessage = translateNotificationMessage(n.message);
            addNotificationToUI(translatedMessage, n.createdAt, n.isRead, n._id);
        });
    }
}

// دالة مساعدة لترجمة رسائل الإشعارات المخزنة
function translateNotificationMessage(message) {
    // إذا كانت الرسالة تحتوي على "أصبح داخل" أو "أصبح خارج"
    if (message.includes('أصبح داخل') || message.includes('أصبح خارج')) {
        const match = message.match(/التلميذ (.*?) أصبح (داخل 🏫|خارج 🚪)/);
        if (match) {
            const name = match[1];
            const status = match[2];
            const statusKey = status.includes('داخل') ? 'student.inside' : 'student.outside';
            const translatedStatus = translate(statusKey);
            // إعادة بناء الرسالة المترجمة
            const translated = translate('attendance.student_became', { name, status: translatedStatus });
            // إضافة الوقت إذا وجد
            const timeMatch = message.match(/\(وقت: (.*?)\)/);
            if (timeMatch) {
                return translated + ' (وقت: ' + timeMatch[1] + ')';
            }
            return translated;
        }
    }
    // إذا كانت الرسالة عن تغيير جميع الطلاب
    if (message.includes('تم تغيير حالة جميع الطلاب إلى داخل')) {
        return translate('attendance.all_students_inside');
    }
    if (message.includes('تم تغيير حالة جميع الطلاب إلى خارج')) {
        return translate('attendance.all_students_outside');
    }
    // إذا كانت الرسالة عن إضافة/تعديل/حذف طالب
    if (message.includes('تم إضافة الطالب')) {
        const match = message.match(/تم إضافة الطالب (.*)/);
        if (match) {
            return translate('attendance.student_added', { name: match[1] });
        }
    }
    if (message.includes('تم تعديل معلومات الطالب')) {
        const match = message.match(/تم تعديل معلومات الطالب (.*)/);
        if (match) {
            return translate('attendance.student_updated', { name: match[1] });
        }
    }
    if (message.includes('تم حذف تلميذ')) {
        return translate('attendance.student_deleted');
    }
    if (message.includes('تم تغيير حالة الطالب')) {
        return translate('attendance.student_toggled');
    }
    if (message.includes('تم إرسال إشعار عام')) {
        return translate('notification.sent_general');
    }
    if (message.includes('تم إرسال إشعار خاص')) {
        return translate('notification.sent_private');
    }
    // إذا كانت الرسالة عن الخروج المبكر
    if (message.includes('تنبيه: باقي')) {
        const match = message.match(/تنبيه: باقي (\d+) دقيقة على خروج (.*?) من المدرسة/);
        if (match) {
            const minutes = match[1];
            const studentName = match[2];
            return translate('leaving_body', { minutes, studentName });
        }
    }
    // إذا لم نجد تطابق، نعيد الرسالة كما هي
    return message;
}

function addNotificationToUI(message, createdAt, isRead = false, id = null) {
    const list = document.getElementById('notificationList');
    const li = document.createElement('li');
    
    // ✅ استخدام التاريخ مباشرة وعرضه عبر formatFullTime
    const correctedDate = new Date(createdAt);
    const time = formatFullTime(correctedDate);
    li.textContent = message + ' (وقت: ' + time + ')';
    li.style.cssText = 'padding:10px 16px; margin:4px 0; border-radius:12px; transition:0.3s;';
    
    if (!isRead) {
        li.style.fontWeight = 'bold';
        li.style.backgroundColor = '#d4e6ff';
        li.style.borderRight = '4px solid #1c7ed6';
        li.style.boxShadow = '0 2px 8px rgba(28,126,214,0.1)';
        
        if (id) {
            fetchWithAuth('/api/notifications/' + id + '/read', { method: 'PUT' })
                .catch(err => console.error('فشل تحديث حالة القراءة'));
        }
    } else {
        li.style.backgroundColor = '#f8fcff';
        li.style.borderRight = '4px solid #d6e8f5';
        li.style.color = '#4a5a6e';
    }
    
    list.appendChild(li);
}

function toggleOldNotifications(show) {
    showOldNotifications = show;
    renderNotifications(showOldNotifications);
}

// ==========================================
// 12. دوال التغيير الجماعي
// ==========================================
async function toggleAllStudents(status) {
    const statusText = status ? translate('student.inside') : translate('student.outside');
    const confirmed = await showConfirmModal(
        translate('bulk.all_inside'),
        translate('bulk.confirm', { status: statusText })
    );
    if (!confirmed) return;

    if (socket) {
        // ✅ إرسال الوقت الحالي بتوقيت UTC
        socket.emit('toggle-all-status', { 
            newStatus: status,
            adjustedTime: new Date().toISOString()
        });
        const key = status ? 'attendance.all_students_inside' : 'attendance.all_students_outside';
        addLog('', new Date(), 'adminLogContainer', key);
    } else {
        alert(translate('common.error'));
    }
}

// ==========================================
// 13. دوال المدير
// ==========================================
async function loadAdminStudents() {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error('فشل جلب الطلاب');
        allStudents = await res.json(); // ✅ تخزين جميع الطلاب
        renderFilteredStudents();
    } catch (err) {
        console.error(err);
    }
}

// عرض الطلاب المصفاة حسب البحث
function renderFilteredStudents() {
    let filtered = allStudents;
    
    // تصفية حسب الاسم
    if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        filtered = allStudents.filter(s => 
            s.name.toLowerCase().includes(query) || 
            (s.studentId && s.studentId.toLowerCase().includes(query))
        );
    }
    
    // عرض النتائج
    renderStudents(filtered, 'adminStudentsList', true);
    
    // إظهار/إخفاء زر إلغاء البحث
    document.getElementById('clearSearchBtn').style.display = searchQuery.trim() ? 'inline-flex' : 'none';
    
    // إظهار رسالة إذا لم توجد نتائج
    const container = document.getElementById('adminStudentsList');
    if (filtered.length === 0 && allStudents.length > 0) {
        container.innerHTML = `<div class="loading-state">🔍 لا توجد نتائج مطابقة لـ "${searchQuery}"</div>`;
    }
}

function renderStudents(students, containerId, showAdminControls) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!students || students.length === 0) {
        container.innerHTML = `<div class="loading-state">${translate('student.no_students')}</div>`;
        return;
    }
    let html = '';
    students.forEach(s => {
        // ✅ إضافة ساعة واحدة إلى lastUpdate قبل التنسيق
        const lastUpdateDate = new Date(s.lastUpdate);
        lastUpdateDate.setHours(lastUpdateDate.getHours() +1);
        const lastUpdateStr = formatFullTime(lastUpdateDate);

        const statusText = translate(s.isInside ? 'student.inside' : 'student.outside');
        const statusClass = s.isInside ? 'inside' : 'outside';
        const toggleText = s.isInside ? translate('student.toggle_exit') : translate('student.entry');
        const toggleClass = s.isInside ? 'exit' : 'enter';
        const parentLabel = translate('student.parent_name');
        const lastUpdateLabel = translate('student.last_update');
        const lastEntryExitLabel = translate('attendance.last_entry_exit');

        html += `
            <div class="student-card" data-id="${s._id}">
                <div>
                    <div class="student-name">${s.name} (${s.studentId})</div>
                    <div style="font-size:14px;color:#4a5a6e;">${parentLabel}: ${s.parentName}</div>
                    <div style="font-size:13px;color:#6a7a8e;">📞 ${s.parentPhone}</div>
                    <span class="student-time">🕒 ${lastUpdateLabel}: ${lastUpdateStr}</span>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="card-actions">
                    ${showAdminControls ? `
                        <button class="btn-toggle ${toggleClass}" onclick="adminToggle('${s._id}')">${toggleText}</button>
                        <button class="btn-delete" onclick="adminDelete('${s._id}')">${translate('common.delete')}</button>
                        <button class="btn-edit" onclick="openEditStudent('${s._id}')"><i class="fas fa-edit"></i> ${translate('common.edit')}</button>
                    ` : `
                        <span style="font-size:13px;color:#7b8b9e;">${lastEntryExitLabel}: ${lastUpdateStr}</span>
                    `}
                    <button class="btn-qr" onclick="downloadQR('${s._id}')"><i class="fas fa-qrcode"></i> ${translate('common.qr')}</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.adminToggle = async function(id) {
    const confirmed = await showConfirmModal(
        translate('student.toggle'),
        translate('student.confirm_toggle')
    );
    if (!confirmed) return;

    fetchWithAuth('/api/students/' + id + '/toggle', { method: 'PUT' })
        .then(res => {
            if (!res.ok) throw new Error(translate('common.error'));
            return res.json();
        })
        .then(() => {
            loadAdminStudents();
            // ✅ استخدام المفتاح
            addLog('', new Date(), 'adminLogContainer', 'attendance.student_toggled');
        })
        .catch(err => alert(translate('common.error') + ': ' + err.message));
};

window.adminDelete = async function(id) {
    const confirmed = await showConfirmModal(
        translate('student.delete'),
        translate('student.confirm_delete')
    );
    if (!confirmed) return;

    fetchWithAuth('/api/students/' + id, { method: 'DELETE' })
        .then(() => {
            loadAdminStudents();
            addLog('', new Date(), 'adminLogContainer', 'attendance.student_deleted');
        })
        .catch(err => alert(translate('common.error') + ': ' + err.message));
};

// ==========================================
// 14. تعديل معلومات الطالب
// ==========================================
window.openEditStudent = async function(studentId) {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error(translate('common.error'));
        const students = await res.json();
        const student = students.find(s => s._id === studentId);
        if (!student) {
            alert(translate('student.not_found'));
            return;
        }

        document.getElementById('editStudentId').value = student._id;
        document.getElementById('editName').value = student.name || '';
        document.getElementById('editParentName').value = student.parentName || '';
        document.getElementById('editParentPhone').value = student.parentPhone || '';
        document.getElementById('editParentEmail').value = student.parentEmail || '';
        document.getElementById('editAddress').value = student.address || '';
        
        // ✅ تحديث عنوان النافذة بالترجمة
        document.querySelector('#editStudentModal h3').textContent = translate('student.edit_title');
        document.getElementById('saveEditStudentBtn').innerHTML = `<i class="fas fa-save"></i> ${translate('student.save')}`;
        document.getElementById('closeEditStudentBtn').innerHTML = `<i class="fas fa-times"></i> ${translate('student.cancel')}`;
        
        document.getElementById('editStudentModal').style.display = 'flex';
    } catch (err) {
        alert(translate('common.error') + ': ' + err.message);
    }
};

document.getElementById('saveEditStudentBtn').addEventListener('click', async function() {
    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('editName').value.trim();
    const parentName = document.getElementById('editParentName').value.trim();
    const parentPhone = document.getElementById('editParentPhone').value.trim();
    const parentEmail = document.getElementById('editParentEmail').value.trim();
    const address = document.getElementById('editAddress').value.trim();

    if (!name || !parentName || !parentPhone || !parentEmail) {
        alert(translate('common.error'));
        return;
    }

    const confirmed = await showConfirmModal(
        translate('student.edit'),
        translate('student.confirm_edit')
    );
    if (!confirmed) return;

    try {
        const res = await fetchWithAuth('/api/students/' + id, {
            method: 'PUT',
            body: JSON.stringify({ name, parentName, parentPhone, parentEmail, address })
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'فشل التعديل');
        }
        alert('✅ تم تعديل معلومات الطالب بنجاح');
        document.getElementById('editStudentModal').style.display = 'none';
        loadAdminStudents();
        addLog('✏️ تم تعديل معلومات الطالب ' + name, new Date(), 'adminLogContainer');
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
});

document.getElementById('closeEditStudentBtn').addEventListener('click', function() {
    document.getElementById('editStudentModal').style.display = 'none';
});

// ==========================================
// 15. عرض جميع سجلات النشاطات في نافذة منبثقة
// ==========================================
document.getElementById('adminShowAllLogsBtn').addEventListener('click', function() {
    const container = document.getElementById('allLogsContainer');
    container.innerHTML = '';
    
    const sortedLogs = [...adminLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sortedLogs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#8a9aaa; padding:20px;">لا توجد سجلات</div>';
    } else {
        sortedLogs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item';
            item.innerHTML = `<span>${log.message}</span><span class="log-time">${log.time}</span>`;
            container.appendChild(item);
        });
    }
    
    document.getElementById('allLogsModal').style.display = 'flex';
});

document.getElementById('closeAllLogsBtn').addEventListener('click', function() {
    document.getElementById('allLogsModal').style.display = 'none';
});

document.getElementById('allLogsModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

document.getElementById('editStudentModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

// ==========================================
// 16. دوال المدير (إضافة طالب، إشعارات، إلخ)
// ==========================================
async function adminAddStudent() {
    const name = document.getElementById('adminStudentName').value.trim();
    const parentEmail = document.getElementById('adminParentEmail').value.trim();
    const parentName = document.getElementById('adminParentName').value.trim();
    const parentPhone = document.getElementById('adminParentPhone').value.trim();
    const address = document.getElementById('adminAddress').value.trim();
    
    if (!name || !parentEmail || !parentName || !parentPhone) {
        alert(translate('common.error') + ': ' + translate('student.add'));
        return;
    }

    const confirmed = await showConfirmModal(
        translate('student.add_new'),
        translate('student.confirm_add', { name, parentName })
    );
    if (!confirmed) return;

    try {
        const res = await fetchWithAuth('/api/students', {
            method: 'POST',
            body: JSON.stringify({ name, parentEmail, parentName, parentPhone, address })
        });

        if (res.ok) {
            // تفريغ الحقول
            document.getElementById('adminStudentName').value = '';
            document.getElementById('adminParentEmail').value = '';
            document.getElementById('adminParentName').value = '';
            document.getElementById('adminParentPhone').value = '';
            document.getElementById('adminAddress').value = '';
            
            // ✅ تحديث القائمة
            loadAdminStudents();
            
            // ✅ إضافة السجل باستخدام المفتاح (بدلاً من النص المترجم)
            addLog('', new Date(), 'adminLogContainer', 'attendance.student_added', { name });
            
            // إخفاء النموذج
            document.getElementById('addStudentForm').style.display = 'none';
            document.getElementById('toggleAddStudentBtn').innerHTML = `<i class="fas fa-plus-circle"></i> ${translate('student.add_new')}`;
        } else {
            const data = await res.json();
            alert(translate('common.error') + ': ' + (data.message || translate('common.error')));
        }
    } catch (err) {
        console.error('❌ خطأ في إضافة الطالب:', err);
        alert(translate('common.error') + ': ' + err.message);
    }
}

function toggleAddStudentForm() {
    const form = document.getElementById('addStudentForm');
    const btn = document.getElementById('toggleAddStudentBtn');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-times"></i> إغلاق نموذج الإضافة';
    } else {
        form.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-plus-circle"></i> إضافة طالب جديد';
    }
}

async function adminSendGeneralNotification() {
    const msg = document.getElementById('adminNotificationMsg').value.trim();
    if (!msg) return alert(translate('notification.message_required'));
    
    const confirmed = await showConfirmModal(
        translate('notification.general'),
        translate('notification.confirm_general')
    );
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification', { message: msg });
        document.getElementById('adminNotificationMsg').value = '';
        addLog(`📢 ${translate('notification.sent_general')}`, new Date(), 'adminLogContainer');
        alert(translate('notification.sent_general'));
    } else {
        alert(translate('common.error'));
    }
}

async function adminSendParentNotification() {
    const email = document.getElementById('adminParentEmailInput').value.trim();
    const msg = document.getElementById('adminParentNotificationMsg').value.trim();
    if (!email || !msg) return alert(translate('common.error'));
    
    const confirmed = await showConfirmModal(
        translate('notification.private'),
        translate('notification.confirm_private', { email })
    );
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification-to-parent', { parentEmail: email, message: msg });
        document.getElementById('adminParentEmailInput').value = '';
        document.getElementById('adminParentNotificationMsg').value = '';
        alert(translate('notification.sent_private'));
    } else {
        alert(translate('common.error'));
    }
}

// ==========================================
// 17. دوال السجل (مع عرض آخر 5 سجلات فقط)
// ==========================================
function addLog(message, date, containerId, key = null, params = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // التاريخ الأصلي (للترتيب والحفظ)
    const originalDate = date || new Date();
    let displayDate = new Date(originalDate);

    // ✅ فقط لسجل ولي الأمر نضيف ساعة للعرض
    if (containerId === 'parentLogContainer') {
        displayDate.setHours(displayDate.getHours() +1);
    }

    const time = formatFullTime(displayDate);

    const logEntry = {
        message,
        time,                     // الوقت المعدل للعرض
        date: originalDate,       // التاريخ الأصلي للترتيب
        key: key,
        params: params
    };

    if (containerId === 'adminLogContainer') {
        adminLogs.unshift(logEntry);
        renderAdminLogs(adminShowOldLogs);
    } else if (containerId === 'parentLogContainer') {
        parentLogs.unshift(logEntry);
        renderParentLogs(parentShowOldLogs);
    }
}

async function loadAdminLogs() {
    renderAdminLogs(adminShowOldLogs);
}

function renderAdminLogs(showOld) {
    const container = document.getElementById('adminLogContainer');
    if (!container) return;

    document.getElementById('adminShowOldLogsBtn').style.display = 'none';
    document.getElementById('adminHideOldLogsBtn').style.display = 'none';
    document.getElementById('adminShowAllLogsBtn').style.display = 'none';

    if (adminLogs.length === 0) {
        container.innerHTML = `<div class="log-item" style="color:#8a9aaa; justify-content:center;">${translate('attendance.no_logs')}</div>`;
        return;
    }

    const sortedLogs = [...adminLogs].sort((a, b) => new Date(b.date) - new Date(a.date));

    const todayLogs = sortedLogs.filter(log => isToday(log.date));
    const oldLogs = sortedLogs.filter(log => !isToday(log.date));

    container.innerHTML = '';
    let logsToShow = [];

    if (showOld) {
        logsToShow = sortedLogs;
        document.getElementById('adminShowOldLogsBtn').style.display = 'none';
        document.getElementById('adminHideOldLogsBtn').style.display = 'inline-flex';
        document.getElementById('adminShowAllLogsBtn').style.display = 'none';
    } else {
        const todayOnly = todayLogs.length > 0 ? todayLogs : sortedLogs.slice(0, 5);
        logsToShow = todayOnly.slice(0, 5);
        
        if (oldLogs.length > 0 || todayLogs.length > 5) {
            document.getElementById('adminShowOldLogsBtn').style.display = 'inline-flex';
            document.getElementById('adminHideOldLogsBtn').style.display = 'none';
            if (sortedLogs.length > 5) {
                document.getElementById('adminShowAllLogsBtn').style.display = 'inline-flex';
            }
        } else {
            document.getElementById('adminShowOldLogsBtn').style.display = 'none';
            document.getElementById('adminHideOldLogsBtn').style.display = 'none';
            document.getElementById('adminShowAllLogsBtn').style.display = 'none';
        }
    }

    logsToShow.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        let displayMessage = log.message;
        if (log.key) {
            displayMessage = translate(log.key, log.params || {});
            if (displayMessage === log.key && log.message) {
                displayMessage = log.message;
            }
        }
        
        // ✅ ترجمة كلمة "وقت"
        const timeLabel = translate('common.time') || 'وقت:';
        const timeDisplay = log.time || '';
        
        item.innerHTML = `<span>${displayMessage}</span><span class="log-time">${timeLabel} ${timeDisplay}</span>`;
        container.appendChild(item);
    });

    if (showOld && oldLogs.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'log-item';
        divider.style.cssText = 'border-top:2px dashed #ccc; margin:10px 0; padding:5px; text-align:center; color:#8a9aaa; font-size:13px;';
        divider.textContent = translate('attendance.old_logs');
        container.appendChild(divider);
    }
}

function toggleAdminOldLogs(show) {
    adminShowOldLogs = show;
    renderAdminLogs(adminShowOldLogs);
}

// ==========================================
// 18. دوال ولي الأمر
// ==========================================
async function loadParentStudents() {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error('فشل جلب بيانات أبنائك');
        const students = await res.json();
        renderStudents(students, 'parentStudentsList', false);

        localStorage.setItem('parentStudents', JSON.stringify(students));
        fillLeaveStudents();

        if (students.length > 0) {
            // ✅ تحميل سجل الحضور لجميع الأبناء
            parentLogs = []; // مسح السجلات القديمة
            for (const student of students) {
                await loadAttendanceForStudent(student._id);
            }
            renderParentLogs(parentShowOldLogs);
        } else {
            parentLogs = [];
            renderParentLogs(parentShowOldLogs);
        }
    } catch (err) {
        console.error(err);
    }
}

// ✅ تم تعديل هذه الدالة لإضافة الترجمة (تبقى كما هي)
async function loadAttendanceForStudent(studentId) {
    try {
        const res = await fetchWithAuth('/api/students/' + studentId + '/attendance');
        if (!res.ok) throw new Error('فشل جلب سجل الحضور');
        const records = await res.json();

        // تحويل السجلات إلى صيغة parentLogs وإضافتها
        records.forEach(r => {
            const isEntry = r.status === 'in';
            const key = isEntry ? 'attendance.entry' : 'attendance.exit';
            const message = isEntry ? translate('attendance.entry') : translate('attendance.exit');

            const timestampDate = new Date(r.timestamp);
            timestampDate.setHours(timestampDate.getHours() + 1);
            const timeStr = formatFullTime(timestampDate);

            parentLogs.push({
                message: message,
                time: timeStr,
                date: new Date(r.timestamp),
                key: key,
                params: {},
                studentName: r.studentName || ''
            });
        });

        // ترتيب السجلات تنازلياً (الأحدث أولاً)
        parentLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    } catch (err) {
        console.error('❌ خطأ في جلب سجل الحضور للطالب:', err);
    }
}

async function loadParentLogs() {
    // ✅ عرض السجلات المخزنة حالياً
    renderParentLogs(parentShowOldLogs);
}

function renderParentLogs(showOld) {
    const container = document.getElementById('parentLogContainer');
    if (!container) return;

    document.getElementById('parentShowOldLogsBtn').style.display = 'none';
    document.getElementById('parentHideOldLogsBtn').style.display = 'none';

    if (parentLogs.length === 0) {
        container.innerHTML = `<div class="log-item" style="color:#8a9aaa; justify-content:center;">${translate('attendance.no_logs')}</div>`;
        return;
    }

    // ✅ ترتيب تنازلي (الأحدث أولاً)
    const sortedLogs = [...parentLogs].sort((a, b) => new Date(b.date) - new Date(a.date));

    const todayLogs = sortedLogs.filter(log => isToday(log.date));
    const oldLogs = sortedLogs.filter(log => !isToday(log.date));

    container.innerHTML = '';
    let logsToShow = [];

    if (showOld) {
        logsToShow = sortedLogs;
        document.getElementById('parentShowOldLogsBtn').style.display = 'none';
        document.getElementById('parentHideOldLogsBtn').style.display = 'inline-flex';
    } else {
        logsToShow = todayLogs.slice(0, 10); // ✅ عرض آخر 10 سجلات اليوم
        if (oldLogs.length > 0 || todayLogs.length > 10) {
            document.getElementById('parentShowOldLogsBtn').style.display = 'inline-flex';
            document.getElementById('parentHideOldLogsBtn').style.display = 'none';
        } else {
            document.getElementById('parentShowOldLogsBtn').style.display = 'none';
            document.getElementById('parentHideOldLogsBtn').style.display = 'none';
        }
    }

    logsToShow.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        // ✅ عرض الرسالة المترجمة
        let displayMessage = log.message;
        if (log.key && !log.message) {
            displayMessage = translate(log.key, log.params || {});
        } else if (log.key && log.message) {
            // إذا كان هناك رسالة ومفتاح، نفضل المفتاح
            displayMessage = translate(log.key, log.params || {});
        }
        
        // إذا كان هناك اسم طالب، نضيفه
        if (log.studentName && !displayMessage.includes(log.studentName)) {
            displayMessage = `${log.studentName}: ${displayMessage}`;
        }
        
        const timeLabel = translate('common.time') || 'وقت:';
        item.innerHTML = `<span>${displayMessage}</span><span class="log-time">${timeLabel} ${log.time}</span>`;
        container.appendChild(item);
    });

    if (showOld && oldLogs.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'log-item';
        divider.style.cssText = 'border-top:2px dashed #ccc; margin:10px 0; padding:5px; text-align:center; color:#8a9aaa; font-size:13px;';
        divider.textContent = translate('attendance.old_logs');
        container.appendChild(divider);
    }
}

function toggleParentOldLogs(show) {
    parentShowOldLogs = show;
    renderParentLogs(parentShowOldLogs);
}

// ==========================================
// دوال الإجازات الإلكترونية
// ==========================================

// جلب طلبات الإجازات
async function loadLeaveRequests() {
  try {
    const res = await fetchWithAuth('/api/leave-requests');
    if (!res.ok) throw new Error('فشل جلب طلبات الإجازات');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

// تقديم طلب عذر غياب
async function submitLeaveRequest(studentId, date, reason, file) {
  try {
    let fileUrl = '';
    let fileName = '';
    
    if (file) {
      const reader = new FileReader();
      fileUrl = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      fileName = file.name;
    }

    const res = await fetchWithAuth('/api/leave-requests', {
      method: 'POST',
      body: JSON.stringify({ studentId, date, reason, fileUrl, fileName })
    });
    
    return await res.json();
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

// الموافقة/الرفض على طلب (للمدير)
async function updateLeaveRequest(requestId, status, adminNote = '') {
  try {
    const res = await fetchWithAuth('/api/leave-requests/' + requestId, {
      method: 'PUT',
      body: JSON.stringify({ status, adminNote })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل تحديث الطلب');
    return data;
  } catch (err) {
    console.error('❌ خطأ في تحديث طلب الإجازة:', err);
    return { success: false, message: err.message };
  }
}

// عرض طلبات الإجازات
function renderLeaveRequests(requests, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!requests || requests.length === 0) {
    container.innerHTML = `<div class="loading-state">${translate('leave.no_requests')}</div>`;
    return;
  }

  let html = '<div class="leave-requests-grid">';
  requests.forEach(r => {
    const statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
    const statusText = translate('leave.status_' + r.status);
    
    // ✅ التاريخ بالأرقام الإنجليزية فقط (YYYY-MM-DD)
    const dateObj = new Date(r.date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    let fileHtml = '';
    if (r.fileUrl) {
      if (r.fileUrl.startsWith('data:image/')) {
        fileHtml = `
          <div class="file-preview">
            <img src="${r.fileUrl}" alt="${r.fileName || 'صورة'}" style="max-width:100px; max-height:100px; border-radius:8px; cursor:pointer;" onclick="window.open('${r.fileUrl}', '_blank')">
            <br>
            <a href="${r.fileUrl}" download="${r.fileName || 'file'}" class="btn-file">📥 ${translate('leave.download_file')}</a>
          </div>
        `;
      } else {
        fileHtml = `
          <div class="file-preview">
            <a href="${r.fileUrl}" target="_blank" class="btn-file">📄 ${translate('leave.view_file')}</a>
            <br>
            <a href="${r.fileUrl}" download="${r.fileName || 'file'}" class="btn-file">📥 ${translate('leave.download_file')}</a>
          </div>
        `;
      }
    }

    html += `
      <div class="leave-request-card" data-id="${r._id}">
        <div class="leave-header">
          <span class="student-name">${r.student.name}</span>
          <span class="leave-status ${statusClass}">${statusText}</span>
        </div>
        <div class="leave-body">
          <p><strong>${translate('leave.reason')}:</strong> ${r.reason}</p>
          <p><strong>${translate('leave.date')}:</strong> ${formattedDate}</p>
          ${fileHtml}
          ${r.adminNote ? `<p><strong>${translate('leave.admin_note')}:</strong> ${r.adminNote}</p>` : ''}
        </div>
        ${currentUser && currentUser.role === 'admin' && r.status === 'pending' ? `
          <div class="leave-actions">
            <button class="btn-approve" onclick="handleLeaveRequest('${r._id}', 'approved')">${translate('leave.approve')}</button>
            <button class="btn-reject" onclick="handleLeaveRequest('${r._id}', 'rejected')">${translate('leave.reject')}</button>
          </div>
        ` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

// معالجة طلب الإجازة (موافقة/رفض)
window.handleLeaveRequest = async function(requestId, status) {
  const confirmed = await showConfirmModal(
    status === 'approved' ? translate('leave.approve') : translate('leave.reject'),
    status === 'approved' ? translate('leave.confirm_approve') : translate('leave.confirm_reject')
  );
  if (!confirmed) return;

  try {
    const result = await updateLeaveRequest(requestId, status);
    if (result.success) {
      alert(result.message);
      // إعادة تحميل الطلبات
      const requests = await loadLeaveRequests();
      renderLeaveRequests(requests, 'leaveRequestsList');
    } else {
      alert(result.message || translate('common.error'));
    }
  } catch (err) {
    console.error('❌ خطأ في معالجة الطلب:', err);
    alert(translate('common.error') + ': ' + err.message);
  }
};

// تعبئة قائمة الطلاب في نموذج الإجازات
function fillLeaveStudents() {
    const select = document.getElementById('leaveStudentSelect');
    if (!select) return;
    
    // ✅ تنظيف القائمة مع الاحتفاظ بالخيار الافتراضي
    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = translate('leave.select_student');
    select.appendChild(defaultOption);
    
    // ✅ جلب الطلاب من localStorage
    const students = JSON.parse(localStorage.getItem('parentStudents') || '[]');
    console.log('📋 جاري تعبئة الطلاب في نموذج الإجازات:', students.length);
    
    students.forEach(s => {
        const option = document.createElement('option');
        option.value = s._id;
        option.textContent = s.name;
        select.appendChild(option);
    });
}

// ربط أحداث الإجازات
function setupLeaveEvents() {
    // تقديم طلب عذر غياب
    document.getElementById('submitLeaveBtn')?.addEventListener('click', async function() {
        const studentId = document.getElementById('leaveStudentSelect').value;
        const date = document.getElementById('leaveDate').value;
        const reason = document.getElementById('leaveReason').value.trim();
        const file = document.getElementById('leaveFile').files[0];

        if (!studentId || !date || !reason) {
            alert(translate('leave.fill_all'));
            return;
        }

        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + translate('common.loading');

        const result = await submitLeaveRequest(studentId, date, reason, file);
        
        this.disabled = false;
        this.innerHTML = '<i class="fas fa-paper-plane"></i> ' + translate('leave.submit');

        const msgDiv = document.getElementById('leaveMessage');
        if (result.success) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#def7e5';
            msgDiv.style.color = '#0a6b34';
            msgDiv.textContent = result.message;
            document.getElementById('leaveReason').value = '';
            document.getElementById('leaveFile').value = '';
            if (currentUser && currentUser.role === 'admin') {
                const requests = await loadLeaveRequests();
                renderLeaveRequests(requests, 'leaveRequestsList');
            }
        } else {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#fde8e6';
            msgDiv.style.color = '#b3362a';
            msgDiv.textContent = result.message || translate('common.error');
        }
        
        setTimeout(() => { msgDiv.style.display = 'none'; }, 5000);
    });
}

// أحداث Socket للإجازات
function setupLeaveSocketEvents() {
    if (!socket) {
        console.warn('⚠️ Socket غير متصل');
        return;
    }

    socket.off('new-leave-request');
    socket.off('leave-request-updated');

    socket.on('new-leave-request', async (data) => {
        if (currentUser && currentUser.role === 'admin') {
            const requests = await loadLeaveRequests();
            renderLeaveRequests(requests, 'leaveRequestsList');
            showBrowserNotification('📩 طلب عذر غياب جديد', data.message);
        }
    });
    
    socket.on('leave-request-updated', async (data) => {
        if (currentUser && currentUser.role === 'parent' && data.parentEmail === currentUser.email) {
            const requests = await loadLeaveRequests();
            renderLeaveRequests(requests, 'leaveRequestsList');
            showBrowserNotification('📩 تحديث طلب العذر', data.message);
        }
    });

    console.log('✅ تم ربط أحداث Socket للإجازات');
}

// ==========================================
// دوال التنبيهات الذكية
// ==========================================

// جلب التنبيهات
async function loadSmartAlerts() {
  try {
    const res = await fetchWithAuth('/api/smart-alerts');
    if (!res.ok) throw new Error('فشل جلب التنبيهات');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

// جلب قواعد التنبيهات
async function loadAlertRules() {
  try {
    const res = await fetchWithAuth('/api/smart-alerts/rules');
    if (!res.ok) throw new Error('فشل جلب القواعد');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

// حفظ قواعد التنبيهات
async function saveAlertRules(rules) {
  try {
    const results = [];
    for (const rule of rules) {
      const res = await fetchWithAuth('/api/smart-alerts/rules/' + rule.type, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: rule.enabled,
          conditions: rule.conditions,
          cooldownDays: rule.cooldownDays || 7,
        }),
      });
      const data = await res.json();
      results.push(data);
    }
    return results;
  } catch (err) {
    console.error(err);
    return [];
  }
}

// تشغيل التنبيهات يدوياً
async function runSmartAlerts() {
  try {
    const res = await fetchWithAuth('/api/smart-alerts/run', { method: 'POST' });
    return await res.json();
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

// عرض التنبيهات الذكية (للمدير)
function renderSmartAlerts(alerts, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `<div class="log-item" style="color:#8a9aaa; justify-content:center; padding:12px;">${translate('smart_alerts.no_alerts')}</div>`;
        return;
    }

    let html = '';
    alerts.forEach(alert => {
        const typeIcon = alert.type === 'absence' ? '🚨' : alert.type === 'tardiness' ? '⏰' : '🎉';
        const isRead = alert.isRead ? '✅' : '🆕';
        const bgColor = !alert.isRead ? 'background:#f0f8ff; border-right:4px solid #1c7ed6;' : '';
        
        html += `
            <div class="log-item" style="${bgColor} padding:8px 12px; border-bottom:1px solid #eef4fa;">
                <span>${typeIcon} ${alert.message}</span>
                <span class="log-time">${formatFullTime(alert.createdAt)} ${isRead}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// ربط أحداث التنبيهات الذكية
// ==========================================
function setupSmartAlertEvents() {
    // زر تشغيل التنبيهات يدوياً
    const runBtn = document.getElementById('runSmartAlertsBtn');
    if (runBtn) {
        runBtn.addEventListener('click', async function() {
            const confirmed = await showConfirmModal(
                translate('smart_alerts.run_now'),
                translate('smart_alerts.confirm_run')
            );
            if (!confirmed) return;
            
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + translate('common.loading');
            
            const result = await runSmartAlerts();
            if (result.success) {
                alert(translate('smart_alerts.run_success'));
                const alerts = await loadSmartAlerts();
                renderSmartAlerts(alerts, 'smartAlertsList');
            } else {
                alert(result.message || translate('common.error'));
            }
            
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-play"></i> ' + translate('smart_alerts.run_now');
        });
        console.log('✅ ربط زر تشغيل التنبيهات الذكية');
    } else {
        console.warn('⚠️ زر runSmartAlertsBtn غير موجود');
    }

    // زر حفظ القواعد
    const saveBtn = document.getElementById('saveAlertRulesBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            const rules = [
                {
                    type: 'absence',
                    enabled: document.getElementById('absenceEnabled')?.checked || false,
                    conditions: {
                        absenceConsecutiveDays: parseInt(document.getElementById('absenceConsecutive')?.value) || 3,
                        absenceMonthlyDays: parseInt(document.getElementById('absenceMonthly')?.value) || 5,
                    },
                    cooldownDays: 7,
                },
                {
                    type: 'tardiness',
                    enabled: document.getElementById('tardinessEnabled')?.checked || false,
                    conditions: {
                        tardinessPerWeek: parseInt(document.getElementById('tardinessPerWeek')?.value) || 3,
                    },
                    cooldownDays: 7,
                },
                {
                    type: 'achievement',
                    enabled: document.getElementById('achievementEnabled')?.checked || false,
                    conditions: {
                        achievementConsecutiveDays: parseInt(document.getElementById('achievementConsecutive')?.value) || 10,
                        achievementMonthlyDays: parseInt(document.getElementById('achievementMonthly')?.value) || 20,
                    },
                    cooldownDays: 14,
                },
            ];
            
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + translate('common.loading');
            
            const results = await saveAlertRules(rules);
            const allSuccess = results.every(r => r.success);
            
            alert(allSuccess ? translate('smart_alerts.rules_saved') : translate('common.error'));
            
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-save"></i> ' + translate('smart_alerts.save_rules');
        });
        console.log('✅ ربط زر حفظ قواعد التنبيهات');
    } else {
        console.warn('⚠️ زر saveAlertRulesBtn غير موجود');
    }

    // تحميل القواعد الحالية عند ظهور الصفحة
    loadAlertRules().then(rules => {
        if (rules && rules.length > 0) {
            const absence = rules.find(r => r.type === 'absence');
            const tardiness = rules.find(r => r.type === 'tardiness');
            const achievement = rules.find(r => r.type === 'achievement');
            
            if (absence) {
                document.getElementById('absenceConsecutive').value = absence.conditions?.absenceConsecutiveDays || 3;
                document.getElementById('absenceMonthly').value = absence.conditions?.absenceMonthlyDays || 5;
                document.getElementById('absenceEnabled').checked = absence.enabled !== false;
            }
            if (tardiness) {
                document.getElementById('tardinessPerWeek').value = tardiness.conditions?.tardinessPerWeek || 3;
                document.getElementById('tardinessEnabled').checked = tardiness.enabled !== false;
            }
            if (achievement) {
                document.getElementById('achievementConsecutive').value = achievement.conditions?.achievementConsecutiveDays || 10;
                document.getElementById('achievementMonthly').value = achievement.conditions?.achievementMonthlyDays || 20;
                document.getElementById('achievementEnabled').checked = achievement.enabled !== false;
            }
        }
    });

    // تحميل التنبيهات المرسلة
    if (document.getElementById('smartAlertsList')) {
        loadSmartAlerts().then(alerts => {
            renderSmartAlerts(alerts, 'smartAlertsList');
        });
    }
}

// ==========================================
// دوال إدارة العطل والإجازات (معدلة)
// ==========================================

// جلب جميع العطل
async function loadHolidays() {
  try {
    const res = await fetchWithAuth('/api/holidays');
    if (!res.ok) throw new Error('فشل جلب العطل');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

// ✅ إضافة عطلة جديدة (معدلة لدعم endDate)
async function addHoliday(date, endDate, name, description) {
  try {
    const res = await fetchWithAuth('/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, endDate, name, description }),
    });
    return await res.json();
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

// حذف عطلة
async function deleteHoliday(id) {
  try {
    const res = await fetchWithAuth('/api/holidays/' + id, { method: 'DELETE' });
    return await res.json();
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

// تبديل حالة العطلة (تفعيل/تعطيل)
async function toggleHolidayStatus(id) {
  try {
    const res = await fetchWithAuth('/api/holidays/' + id + '/toggle', {
      method: 'PUT',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل تحديث الحالة');
    return data;
  } catch (err) {
    console.error('❌ خطأ في تبديل حالة العطلة:', err);
    return { success: false, message: err.message };
  }
}

// ✅ تعديل عطلة (معدلة لدعم endDate)
async function updateHoliday(id, date, endDate, name, description) {
  try {
    const res = await fetchWithAuth('/api/holidays/' + id, {
      method: 'PUT',
      body: JSON.stringify({ date, endDate, name, description }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل التعديل');
    return data;
  } catch (err) {
    console.error('❌ خطأ في تعديل العطلة:', err);
    return { success: false, message: err.message };
  }
}

// دالة معالجة تبديل الحالة (مع تأكيد)
window.handleToggleHoliday = async function(id) {
  const holidays = await loadHolidays();
  const holiday = holidays.find(h => h._id === id);
  const name = holiday ? holiday.name : 'هذه العطلة';
  const currentStatus = holiday?.isActive !== false;
  const action = currentStatus ? 'تعطيل' : 'تفعيل';
  
  const confirmed = await showConfirmModal(
    `${action} العطلة`,
    `هل أنت متأكد من ${action} عطلة "${name}"؟`
  );
  if (!confirmed) return;
  
  const result = await toggleHolidayStatus(id);
  if (result.success) {
    alert('✅ ' + result.message);
    const holidays = await loadHolidays();
    renderHolidays(holidays, 'holidaysList');
  } else {
    alert('❌ ' + (result.message || 'حدث خطأ'));
  }
};

// ✅ دالة معالجة التعديل (معدلة لدعم endDate)
window.handleEditHoliday = async function(id) {
  const holidays = await loadHolidays();
  const holiday = holidays.find(h => h._id === id);
  if (!holiday) {
    alert('❌ العطلة غير موجودة');
    return;
  }
  
  const date = new Date(holiday.date);
  const formattedDate = date.toISOString().split('T')[0];
  const endDate = holiday.endDate ? new Date(holiday.endDate) : null;
  const formattedEndDate = endDate ? endDate.toISOString().split('T')[0] : '';
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 25px; border-radius: 12px; width: 400px; max-width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
      <h3 style="margin-top: 0; color: #2c3e50;">✏️ تعديل العطلة</h3>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>📅 تاريخ البداية</label>
        <input type="date" id="editHolidayDate" value="${formattedDate}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>📅 تاريخ النهاية (اختياري - للإجازات المتعددة الأيام)</label>
        <input type="date" id="editHolidayEndDate" value="${formattedEndDate}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>📝 اسم العطلة</label>
        <input type="text" id="editHolidayName" value="${holiday.name}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>📋 وصف (اختياري)</label>
        <textarea id="editHolidayDescription" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; resize: vertical;">${holiday.description || ''}</textarea>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button id="saveEditHolidayBtn" class="btn-success" style="flex: 1; padding: 10px; border: none; border-radius: 6px; background: #27ae60; color: white; cursor: pointer;">
          <i class="fas fa-save"></i> حفظ التعديلات
        </button>
        <button id="cancelEditHolidayBtn" class="btn-secondary" style="flex: 1; padding: 10px; border: none; border-radius: 6px; background: #95a5a6; color: white; cursor: pointer;">
          <i class="fas fa-times"></i> إلغاء
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  document.getElementById('cancelEditHolidayBtn').addEventListener('click', function() {
    modal.remove();
  });
  
  document.getElementById('saveEditHolidayBtn').addEventListener('click', async function() {
    const newDate = document.getElementById('editHolidayDate').value;
    const newEndDate = document.getElementById('editHolidayEndDate').value || newDate;
    const newName = document.getElementById('editHolidayName').value.trim();
    const newDescription = document.getElementById('editHolidayDescription').value.trim();
    
    if (!newDate || !newName) {
      alert('الرجاء إدخال التاريخ واسم العطلة');
      return;
    }
    
    this.disabled = true;
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    
    const result = await updateHoliday(id, newDate, newEndDate, newName, newDescription);
    
    this.disabled = false;
    this.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
    
    if (result.success) {
      alert('✅ ' + result.message);
      modal.remove();
      const holidays = await loadHolidays();
      renderHolidays(holidays, 'holidaysList');
    } else {
      alert('❌ ' + (result.message || 'حدث خطأ'));
    }
  });
  
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
};

// ✅ عرض العطل في الواجهة (معدل لعرض مدة العطلة)
function renderHolidays(holidays, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!holidays || holidays.length === 0) {
    container.innerHTML = `<div class="log-item" style="color:#8a9aaa; justify-content:center; padding:12px;">${translate('holidays.no_holidays')}</div>`;
    return;
  }

  let html = '';
  holidays.forEach(h => {
    const startDate = new Date(h.date);
    const endDate = h.endDate ? new Date(h.endDate) : new Date(h.date);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    const dateDisplay = startStr === endStr ? startStr : `${startStr} → ${endStr}`;
    
    const isActive = h.isActive !== false;
    const statusText = isActive ? translate('holidays.active') : translate('holidays.inactive');
    const statusColor = isActive ? '#27ae60' : '#e74c3c';
    const toggleText = isActive ? translate('holidays.toggle') : translate('holidays.activate');
    const toggleColor = isActive ? '#f39c12' : '#27ae60';
    const toggleIcon = isActive ? 'fa-pause' : 'fa-play';
    
    html += `
      <div class="log-item" style="padding:8px 12px; border-bottom:1px solid #eef4fa; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span>📅 ${dateDisplay}</span>
          <span style="font-weight: bold;">${h.name}</span>
          ${h.description ? `<span style="color:#7f8c8d; font-size:13px;">(${h.description})</span>` : ''}
          <span style="color: ${statusColor}; font-size:13px; font-weight: bold;">${statusText}</span>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button onclick="handleToggleHoliday('${h._id}')" 
                  style="background: ${toggleColor}; 
                         border: none; 
                         color: white; 
                         padding: 5px 12px; 
                         border-radius: 6px; 
                         cursor: pointer; 
                         font-size: 13px;
                         transition: 0.3s;">
            <i class="fas ${toggleIcon}"></i> 
            ${toggleText}
          </button>
          <button onclick="handleEditHoliday('${h._id}')" 
                  style="background: #3498db; 
                         border: none; 
                         color: white; 
                         padding: 5px 12px; 
                         border-radius: 6px; 
                         cursor: pointer; 
                         font-size: 13px;
                         transition: 0.3s;">
            <i class="fas fa-edit"></i> ${translate('holidays.edit')}
          </button>
          <button onclick="handleDeleteHoliday('${h._id}')" 
                  style="background: #e74c3c; 
                         border: none; 
                         color: white; 
                         padding: 5px 12px; 
                         border-radius: 6px; 
                         cursor: pointer; 
                         font-size: 13px;
                         transition: 0.3s;">
            <i class="fas fa-trash-alt"></i> ${translate('common.delete')}
          </button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// حذف عطلة (مع تأكيد)
window.handleDeleteHoliday = async function(id) {
  const confirmed = await showConfirmModal(
    translate('holidays.delete'),
    translate('holidays.confirm_delete')
  );
  if (!confirmed) return;
  
  const result = await deleteHoliday(id);
  if (result.success) {
    alert(result.message);
    const holidays = await loadHolidays();
    renderHolidays(holidays, 'holidaysList');
  } else {
    alert(result.message || translate('common.error'));
  }
};

// ✅ إعداد أحداث العطل (معدل لدعم endDate)
function setupHolidayEvents() {
  console.log('🔧 جاري إعداد أحداث العطل...');
  
  let toggleBtn = document.getElementById('toggleHolidayFormBtn');
  let form = document.getElementById('holidayForm');
  
  if (!toggleBtn) {
    console.warn('⚠️ زر إضافة عطلة غير موجود');
    return;
  }

  if (!form) {
    console.log('📝 النموذج غير موجود، جاري إنشائه...');
    form = document.createElement('div');
    form.id = 'holidayForm';
    form.style.cssText = 'display: none; background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;';
    form.innerHTML = `
        <div class="form-group">
            <label>📅 تاريخ البداية</label>
            <input type="date" id="holidayDate" class="form-control">
        </div>
        <div class="form-group">
            <label>📅 تاريخ النهاية (اختياري - للإجازات المتعددة الأيام)</label>
            <input type="date" id="holidayEndDate" class="form-control">
        </div>
        <div class="form-group">
            <label>📝 اسم العطلة</label>
            <input type="text" id="holidayName" class="form-control" placeholder="مثال: عيد الفطر">
        </div>
        <div class="form-group">
            <label>📋 وصف (اختياري)</label>
            <textarea id="holidayDescription" class="form-control" placeholder="وصف العطلة..."></textarea>
        </div>
        <div class="form-actions" style="display: flex; gap: 10px; margin-top: 10px;">
            <button id="saveHolidayBtn" class="btn-success">
                <i class="fas fa-save"></i> حفظ العطلة
            </button>
            <button id="cancelHolidayBtn" class="btn-secondary">
                <i class="fas fa-times"></i> إلغاء
            </button>
        </div>
    `;
    toggleBtn.parentNode.insertBefore(form, toggleBtn.nextSibling);
    console.log('✅ تم إنشاء النموذج بنجاح');
  } else {
    // ✅ التأكد من وجود حقل تاريخ النهاية
    let endDateInput = document.getElementById('holidayEndDate');
    if (!endDateInput) {
      console.log('⚠️ حقل تاريخ النهاية غير موجود، جاري إضافته...');
      const formGroups = form.querySelectorAll('.form-group');
      if (formGroups.length >= 1) {
        const newField = document.createElement('div');
        newField.className = 'form-group';
        newField.style.marginBottom = '12px';
        newField.innerHTML = `
            <label>📅 تاريخ النهاية (اختياري - للإجازات المتعددة الأيام)</label>
            <input type="date" id="holidayEndDate" class="form-control">
        `;
        formGroups[0].after(newField);
        console.log('✅ تم إضافة حقل تاريخ النهاية');
      }
    }
  }

  const newToggleBtn = toggleBtn.cloneNode(true);
  toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
  toggleBtn = newToggleBtn;
  
  const saveBtn = document.getElementById('saveHolidayBtn');
  const cancelBtn = document.getElementById('cancelHolidayBtn');

  toggleBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🔄 تم النقر على زر إضافة عطلة');
    
    if (!form) {
      console.error('❌ النموذج غير موجود!');
      return;
    }
    
    if (form.style.display === 'none' || form.style.display === '') {
      form.style.display = 'block';
      this.innerHTML = '<i class="fas fa-times"></i> إغلاق النموذج';
      console.log('✅ تم إظهار النموذج');
    } else {
      form.style.display = 'none';
      this.innerHTML = '<i class="fas fa-plus"></i> إضافة عطلة';
      console.log('✅ تم إخفاء النموذج');
    }
  }, { once: false });

  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    newCancelBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (form) form.style.display = 'none';
      if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة عطلة';
      console.log('✅ تم إلغاء النموذج');
    });
  }

  if (saveBtn) {
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    newSaveBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('💾 محاولة حفظ العطلة...');
      
      const date = document.getElementById('holidayDate')?.value;
      const endDate = document.getElementById('holidayEndDate')?.value || date;
      const name = document.getElementById('holidayName')?.value.trim();
      const description = document.getElementById('holidayDescription')?.value.trim();

      if (!date || !name) {
        alert('الرجاء إدخال التاريخ واسم العطلة');
        return;
      }

      this.disabled = true;
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

      const result = await addHoliday(date, endDate, name, description);
      
      this.disabled = false;
      this.innerHTML = '<i class="fas fa-save"></i> حفظ العطلة';

      if (result.success) {
        alert('✅ ' + result.message);
        if (form) form.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة عطلة';
        document.getElementById('holidayDate').value = '';
        document.getElementById('holidayEndDate').value = '';
        document.getElementById('holidayName').value = '';
        document.getElementById('holidayDescription').value = '';
        
        const holidays = await loadHolidays();
        renderHolidays(holidays, 'holidaysList');
      } else {
        alert('❌ ' + (result.message || 'حدث خطأ'));
      }
    });
  }

  if (document.getElementById('holidaysList')) {
    loadHolidays().then(holidays => {
      renderHolidays(holidays, 'holidaysList');
    });
  }
  
  console.log('✅ تم إعداد أحداث العطل بنجاح');
}
// ==========================================
// 19. أحداث المصادقة وربط الأحداث (DOM فقط)
// ==========================================
function setupAuthEvents() {
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) return alert('املأ جميع الحقول');
        try {
            const res = await fetch(API_BASE_URL + '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            saveAuth(data);
        } catch (err) {
            alert(err.message || 'فشل تسجيل الدخول');
        }
    });

    document.getElementById('registerBtn').addEventListener('click', async () => {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const role = document.getElementById('regRole').value;
        if (!name || !email || !password || !phone) return alert('املأ جميع الحقول');
        if (password.length < 6) return alert('كلمة المرور 6 أحرف على الأقل');
        try {
            const res = await fetch(API_BASE_URL + '/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, phone, role })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            saveAuth(data);
        } catch (err) {
            alert(err.message || 'فشل التسجيل');
        }
    });

    document.getElementById('showRegister').addEventListener('click', showRegister);
    document.getElementById('showLogin').addEventListener('click', showLogin);
    document.getElementById('logoutBtnAdmin').addEventListener('click', logout);
    document.getElementById('logoutBtnParent').addEventListener('click', logout);

    document.getElementById('toggleSettingsBtn').addEventListener('click', toggleSettingsForm);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSchoolSettings);
    document.getElementById('toggleAddStudentBtn').addEventListener('click', toggleAddStudentForm);
    document.getElementById('adminAddBtn').addEventListener('click', adminAddStudent);
    document.getElementById('adminSendNotificationBtn').addEventListener('click', adminSendGeneralNotification);
    document.getElementById('adminSendParentNotificationBtn').addEventListener('click', adminSendParentNotification);
    
    document.getElementById('toggleAllInsideBtn').addEventListener('click', function() {
        toggleAllStudents(true);
    });
    document.getElementById('toggleAllOutsideBtn').addEventListener('click', function() {
        toggleAllStudents(false);
    });

    document.getElementById('adminShowOldLogsBtn').addEventListener('click', function() {
        toggleAdminOldLogs(true);
    });
    document.getElementById('adminHideOldLogsBtn').addEventListener('click', function() {
        toggleAdminOldLogs(false);
    });

    document.getElementById('parentShowOldLogsBtn').addEventListener('click', function() {
        toggleParentOldLogs(true);
    });
    document.getElementById('parentHideOldLogsBtn').addEventListener('click', function() {
        toggleParentOldLogs(false);
    });

    document.getElementById('showOldNotificationsBtn').addEventListener('click', function() {
        toggleOldNotifications(true);
    });
    document.getElementById('hideOldNotificationsBtn').addEventListener('click', function() {
        toggleOldNotifications(false);
    });
}

// ==========================================
// أحداث البحث عن التلميذ
// ==========================================
function setupSearchEvents() {
    const searchInput = document.getElementById('searchStudentInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const qrBtn = document.getElementById('searchByQRBtn');
    
    if (searchInput) {
        // البحث عند الكتابة
        searchInput.addEventListener('input', function() {
            searchQuery = this.value;
            renderFilteredStudents();
        });
        
        // البحث عند الضغط على Enter
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                searchQuery = this.value;
                renderFilteredStudents();
            }
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            searchInput.value = '';
            searchQuery = '';
            renderFilteredStudents();
            searchInput.focus();
        });
    }
    
    if (qrBtn) {
        qrBtn.addEventListener('click', function() {
            // ✅ فتح الماسح الضوئي للبحث عن تلميذ
            openScannerForSearch();
        });
    }
}

// فتح الماسح الضوئي للبحث عن تلميذ
function openScannerForSearch() {
    const modal = document.getElementById('scannerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = `📷 ${translate('qr.accessing_camera')}`;

    if (typeof Html5Qrcode === 'undefined') {
        if (resultsContainer) resultsContainer.innerHTML = '❌ مكتبة المسح غير محملة، تحقق من اتصال الإنترنت.';
        return;
    }

    if (html5QrCode) {
        html5QrCode.stop()
            .then(() => {
                html5QrCode.clear();
                html5QrCode = null;
                startScannerForSearch();
            })
            .catch(() => {
                html5QrCode = null;
                startScannerForSearch();
            });
    } else {
        startScannerForSearch();
    }
}

function startScannerForSearch() {
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = '📷 جاري الوصول للكاميرا...';

    html5QrCode = new Html5Qrcode('qr-reader');

    Html5Qrcode.getCameras()
        .then(devices => {
            if (devices && devices.length > 0) {
                let selectedCamera = devices[0];
                const backCamera = devices.find(d => {
                    const label = d.label.toLowerCase();
                    return label.includes('back') || label.includes('rear') || label.includes('environment');
                });
                if (backCamera) selectedCamera = backCamera;
                currentCameraId = selectedCamera.id;
                startNewScannerForSearch(currentCameraId);
            } else {
                if (resultsContainer) resultsContainer.innerHTML = '❌ لا توجد كاميرات متاحة على هذا الجهاز.';
            }
        })
        .catch(err => {
            console.error('خطأ في الوصول للكاميرات:', err);
            if (resultsContainer) {
                if (err.message && err.message.includes('Permission')) {
                    resultsContainer.innerHTML = '❌ تم رفض إذن الكاميرا. يرجى السماح بالوصول إلى الكاميرا في إعدادات المتصفح.';
                } else {
                    resultsContainer.innerHTML = `❌ فشل الوصول للكاميرا: ${err.message || 'خطأ غير معروف'}`;
                }
            }
        });
}

function startNewScannerForSearch(cameraId) {
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = '⏳ جاري تشغيل الكاميرا...';

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
    }

    html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        function onScanSuccess(decodedText, decodedResult) {
            // ✅ عند مسح QR Code بنجاح، نبحث عن التلميذ
            const cleanData = decodedText.trim();
            const student = allStudents.find(s => s.studentId === cleanData || s._id === cleanData);
            
            if (student) {
                resultsContainer.innerHTML = `✅ تم العثور على التلميذ: ${student.name}`;
                // عرض الطالب فقط في القائمة
                renderStudents([student], 'adminStudentsList', true);
                // إغلاق الماسح بعد 2 ثانية
                setTimeout(() => {
                    closeScanner();
                    // وضع اسم الطالب في حقل البحث
                    document.getElementById('searchStudentInput').value = student.name;
                    searchQuery = student.name;
                }, 1500);
            } else {
                resultsContainer.innerHTML = `❌ لم يتم العثور على تلميذ بهذا الكود`;
                // إعادة تشغيل الماسح بعد 2 ثانية
                setTimeout(() => {
                    if (html5QrCode) html5QrCode.resume();
                }, 2000);
            }
        },
        function onScanError(error) {
            // تجاهل الأخطاء العادية
        }
    )
    .then(() => {
        if (resultsContainer) resultsContainer.innerHTML = '📸 ضع كود QR الخاص بالتلميذ أمام الكاميرا';
        currentCameraId = cameraId;
    })
    .catch(err => {
        console.error('فشل تشغيل الكاميرا:', err);
        if (resultsContainer) {
            resultsContainer.innerHTML = `❌ فشل تشغيل الكاميرا: ${err.message || 'خطأ غير معروف'}`;
        }
    });
}

// دوال الإشعارات
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registered successfully');
            return registration;
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            return null;
        }
    }
    return null;
}

async function subscribeUser(registration) {
    try {
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
            const statusEl = document.getElementById('notificationStatus');
            if (statusEl) statusEl.innerText = '❌ تم رفض الإشعارات.';
            return false;
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        const response = await fetch('/api/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const statusEl = document.getElementById('notificationStatus');
            const btnEl = document.getElementById('enableNotificationsBtn');
            if (statusEl) statusEl.innerText = '✅ الإشعارات مفعلة بنجاح!';
            if (btnEl) btnEl.style.display = 'none';
            return true;
        } else {
            const statusEl = document.getElementById('notificationStatus');
            if (statusEl) statusEl.innerText = '❌ فشل الحفظ في الخادم.';
            return false;
        }
    } catch (error) {
        console.error('Subscription error:', error);
        const statusEl = document.getElementById('notificationStatus');
        if (statusEl) statusEl.innerText = '❌ حدث خطأ أثناء التفعيل.';
        return false;
    }
}

async function checkSubscriptionStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        const statusEl = document.getElementById('notificationStatus');
        if (statusEl) statusEl.innerText = '⚠️ المتصفح لا يدعم الإشعارات.';
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        const btnEl = document.getElementById('enableNotificationsBtn');
        const statusEl = document.getElementById('notificationStatus');

        if (subscription) {
            if (btnEl) btnEl.style.display = 'none';
            if (statusEl) statusEl.innerText = '✅ الإشعارات مفعلة.';
        } else {
            if (btnEl) btnEl.style.display = 'block';
            if (statusEl) statusEl.innerText = '🔔 اضغط لتفعيل الإشعارات.';
        }
    } catch (error) {
        console.error('Check subscription error:', error);
    }
}

// تشغيل الكود عند تحميل الصفحة (بأمان دون التعارض مع أحداث DOMContentLoaded الأخرى)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotifications);
} else {
    initNotifications();
}

async function initNotifications() {
    // تأكد من وجود عناصر الإشعارات في الصفحة قبل المتابعة
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) {
        console.log('⚠️ زر تفعيل الإشعارات غير موجود في هذه الصفحة، تخطي الكود.');
        return;
    }

    await registerServiceWorker();
    await checkSubscriptionStatus();

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerText = 'جاري التفعيل...';

        const registration = await navigator.serviceWorker.ready;
        await subscribeUser(registration);

        btn.disabled = false;
        btn.innerText = '🔔 تفعيل الإشعارات';
    });
}

// ==========================================
// دوال ولي الأمر الجديدة (إرسال رسائل) - إضافة مستقلة
// ==========================================

// 1. جلب قائمة الأبناء وتعبئة القائمة المنسدلة
async function loadParentChildren() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(API_BASE_URL + '/api/parent/my-children', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('فشل في جلب الأبناء');
        const students = await response.json();

        const select = document.getElementById('parentStudentSelect');
        if (select) {
            select.innerHTML = '<option value="">-- اختر الطالب --</option>';
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student._id;
                option.textContent = student.name;
                select.appendChild(option);
            });
        }

        // تخزين الطلاب في localStorage للاستخدامات الأخرى (مثل الإجازات)
        localStorage.setItem('parentStudents', JSON.stringify(students));

    } catch (error) {
        console.error('خطأ في تحميل الأبناء:', error);
    }
}

// 2. معالجة إرسال رسالة ولي الأمر
function setupParentMessageForm() {
    const form = document.getElementById('parentMessageForm');
    const alertDiv = document.getElementById('parentMessageAlert');
    if (!form || !alertDiv) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const studentId = document.getElementById('parentStudentSelect').value;
        const subject = document.getElementById('parentSubjectInput').value.trim();
        const message = document.getElementById('parentMessageInput').value.trim();
        const token = localStorage.getItem('token');

        if (!studentId) {
            showParentAlert('الرجاء اختيار الطالب.', 'error');
            return;
        }
        if (!message) {
            showParentAlert('الرجاء كتابة نص الرسالة.', 'error');
            return;
        }

        const btn = document.getElementById('parentSendMessageBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'جاري الإرسال...';
        }

        try {
            const response = await fetch(API_BASE_URL + '/api/parent/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ studentId, subject, message })
            });

            const data = await response.json();
            if (response.ok) {
                showParentAlert('✅ تم إرسال رسالتك بنجاح!', 'success');
                form.reset();
                document.getElementById('parentStudentSelect').value = '';
            } else {
                showParentAlert(`❌ فشل الإرسال: ${data.msg || 'خطأ غير معروف'}`, 'error');
            }
        } catch (error) {
            console.error(error);
            showParentAlert('❌ حدث خطأ في الاتصال بالخادم.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'إرسال الرسالة';
            }
        }
    });

    function showParentAlert(text, type) {
        alertDiv.textContent = text;
        alertDiv.className = 'alert-msg-form';
        alertDiv.classList.add(type === 'success' ? 'alert-success-form' : 'alert-error-form');
        clearTimeout(window.parentAlertTimeout);
        window.parentAlertTimeout = setTimeout(() => {
            alertDiv.className = 'alert-msg-form';
            alertDiv.textContent = '';
        }, 6000);
    }
}

// ==========================================
// الوضع الليلي (Dark Mode)
// ==========================================

// التحقق من تفضيل المستخدم المخزن
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    updateDarkModeIcon();
}

// دالة تبديل الوضع الليلي
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateDarkModeIcon();
}

// دالة تحديث أيقونة الزر
function updateDarkModeIcon() {
    const toggles = document.querySelectorAll('.dark-mode-toggle');
    const isDark = document.body.classList.contains('dark-mode');
    toggles.forEach(btn => {
        btn.innerHTML = isDark 
            ? '<i class="fas fa-sun"></i>' 
            : '<i class="fas fa-moon"></i>';
        btn.title = isDark ? 'الوضع النهاري' : 'الوضع الليلي';
    });
}

// ربط حدث النقر على أزرار التبديل
document.addEventListener('click', function(e) {
    if (e.target.closest('.dark-mode-toggle')) {
        toggleDarkMode();
    }
});

// عند تحميل الصفحة، تأكد من تحديث الأيقونة
document.addEventListener('DOMContentLoaded', function() {
    updateDarkModeIcon();
});

updateDarkModeIcon();

// ==========================================
// 20. بدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    await loadTranslations();
    applyTranslationsToAll();

    loadSchoolSettings();
    setupAuthEvents();
    setupLeaveEvents();
    setupSearchEvents(); 
    setupSmartAlertEvents();
    setupHolidayEvents();
    
    if (token) {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (user) {
                currentUser = user;
                if (currentUser.role === 'admin') {
                    showAdminDashboard();
                } else {
                    showParentDashboard();
                }
                return;
            }
        } catch(e) {}
    }
    showLogin();
});
