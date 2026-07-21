// =========================================
// 1. رابط الخادم
// =========================================
const API_BASE_URL = 'https://studenttracker-zgom.onrender.com';
const SOCKET_URL = API_BASE_URL;

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
        
        if (!arRes.ok || !frRes.ok) {
            throw new Error('فشل تحميل ملفات الترجمة');
        }
        
        window.translations = {
            ar: await arRes.json(),
            fr: await frRes.json()
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
    const year = date.getFullYear();
    const month = String(date.getMonth()+1).padStart(2,'0');
    const day = String(date.getDate()).padStart(2,'0');
    const hours = String(date.getHours()).padStart(2,'0');
    const minutes = String(date.getMinutes()).padStart(2,'0');
    const seconds = String(date.getSeconds()).padStart(2,'0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
}

function showParentDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('parentDashboard').style.display = 'block';
    connectSocket();
    loadParentStudents();
    loadParentLogs();
    loadParentNotifications();
}

// ==========================================
// 6. Socket.io
// ==========================================
function connectSocket() {
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(SOCKET_URL, { auth: { token } });

    socket.on('connect', () => console.log('✅ Socket متصل'));

socket.on('status-changed', (data) => {
    if (currentUser.role === 'admin') {
        loadAdminStudents();
        loadAdminLogs();
    } else {
        if (data.parentEmail === currentUser.email || data.parentId === currentUser.id) {
            loadParentStudents();
            loadParentLogs();
            const statusText = data.student.isInside ? translate('student.inside') : translate('student.outside');
            const message = translate('notification.status_changed', { name: data.student.name, status: statusText });
            addLog(message, new Date(), 'parentLogContainer');
            showBrowserNotification(translate('notification.title'), message);
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
    document.getElementById('schoolName').textContent = schoolSettings.schoolName || 'مدرسة النور الابتدائية';
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
            body: JSON.stringify({ schoolName, address, phone, email, logo, logoFileName })
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
        const vapidPublicKey = 'BF7IlardTlVn6X4dNtcTad2ixM09jH87Q-vKyo5ScWY9uzLw3y-goXcgPmC8gxBpFWIGVgFWKxwC2pTDXNYnlD4';
        const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

        let subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            console.log('✅ اشتراك موجود مسبقاً');
            await sendSubscriptionToServer(subscription);
            return subscription;
        }

        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey,
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
            addLog('📩 ' + n.message + ' (إلى: ' + n.target + ')', n.createdAt, 'adminLogContainer');
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
        list.innerHTML = '<li style="color:#8a9aaa; text-align:center; padding:20px;">📭 لا توجد إشعارات حالياً</li>';
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
        addNotificationToUI(n.message, n.createdAt, n.isRead, n._id);
    });

    if (showOld && oldNotifications.length > 0) {
        const divider = document.createElement('li');
        divider.style.cssText = 'border-top:2px dashed #ccc; margin:10px 0; padding:5px; text-align:center; color:#8a9aaa; font-size:13px;';
        divider.textContent = '📜 الإشعارات القديمة';
        list.appendChild(divider);
        
        oldNotifications.forEach(n => {
            addNotificationToUI(n.message, n.createdAt, n.isRead, n._id);
        });
    }
}

function addNotificationToUI(message, createdAt, isRead = false, id = null) {
    const list = document.getElementById('notificationList');
    const li = document.createElement('li');
    const time = formatFullTime(createdAt);
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
        socket.emit('toggle-all-status', { newStatus: status });
        addLog(`🔄 ${translate('bulk.all_inside')} ${statusText}`, new Date(), 'adminLogContainer');
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
        const students = await res.json();
        renderStudents(students, 'adminStudentsList', true);
    } catch (err) {
        console.error(err);
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
        const statusText = getStatusText(s.isInside);
        const statusClass = getStatusClass(s.isInside);
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
                    <span class="student-time">🕒 ${lastUpdateLabel}: ${formatFullTime(s.lastUpdate)}</span>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="card-actions">
                    ${showAdminControls ? `
                        <button class="btn-toggle ${toggleClass}" onclick="adminToggle('${s._id}')">${toggleText}</button>
                        <button class="btn-delete" onclick="adminDelete('${s._id}')">${translate('common.delete')}</button>
                        <button class="btn-edit" onclick="openEditStudent('${s._id}')"><i class="fas fa-edit"></i> ${translate('common.edit')}</button>
                    ` : `
                        <span style="font-size:13px;color:#7b8b9e;">${lastEntryExitLabel}: ${formatFullTime(s.lastUpdate)}</span>
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
            if (!res.ok) throw new Error('فشل تغيير الحالة');
            return res.json();
        })
        .then(() => {
            loadAdminStudents();
            addLog(translate('student.toggled'), new Date(), 'adminLogContainer');
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
            addLog(translate('student.deleted'), new Date(), 'adminLogContainer');
        })
        .catch(err => alert(translate('common.error') + ': ' + err.message));
};

// ==========================================
// 14. تعديل معلومات الطالب
// ==========================================
window.openEditStudent = async function(studentId) {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error('فشل جلب بيانات الطالب');
        const students = await res.json();
        const student = students.find(s => s._id === studentId);
        if (!student) {
            alert('الطالب غير موجود');
            return;
        }

        document.getElementById('editStudentId').value = student._id;
        document.getElementById('editName').value = student.name || '';
        document.getElementById('editParentName').value = student.parentName || '';
        document.getElementById('editParentPhone').value = student.parentPhone || '';
        document.getElementById('editParentEmail').value = student.parentEmail || '';
        document.getElementById('editAddress').value = student.address || '';
        document.getElementById('editStudentModal').style.display = 'flex';
    } catch (err) {
        alert('خطأ في جلب بيانات الطالب: ' + err.message);
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
        alert('جميع الحقول مطلوبة ما عدا العنوان');
        return;
    }

    const confirmed = await showConfirmModal('تعديل الطالب', 'هل أنت متأكد من حفظ التعديلات؟');
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

    const res = await fetchWithAuth('/api/students', {
        method: 'POST',
        body: JSON.stringify({ name, parentEmail, parentName, parentPhone, address })
    });
    if (res.ok) {
        document.getElementById('adminStudentName').value = '';
        document.getElementById('adminParentEmail').value = '';
        document.getElementById('adminParentName').value = '';
        document.getElementById('adminParentPhone').value = '';
        document.getElementById('adminAddress').value = '';
        loadAdminStudents();
        addLog(translate('student.added', { name }), new Date(), 'adminLogContainer');
        document.getElementById('addStudentForm').style.display = 'none';
        document.getElementById('toggleAddStudentBtn').innerHTML = `<i class="fas fa-plus-circle"></i> ${translate('student.add_new')}`;
    } else {
        const data = await res.json();
        alert(translate('common.error') + ': ' + data.message);
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
function addLog(message, date, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const time = formatFullTime(date || new Date());
    const logEntry = { message: translate(message), time, date: date || new Date() };

    if (containerId === 'adminLogContainer') {
        adminLogs.push(logEntry);
        renderAdminLogs(adminShowOldLogs);
    } else if (containerId === 'parentLogContainer') {
        parentLogs.push(logEntry);
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
        container.innerHTML = '<div class="log-item" style="color:#8a9aaa; justify-content:center;">لا توجد نشاطات بعد</div>';
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
        item.innerHTML = `<span>${log.message}</span><span class="log-time">${log.time}</span>`;
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
        if (students.length > 0) {
            loadAttendance(students[0]._id);
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadAttendance(studentId) {
    try {
        const res = await fetchWithAuth('/api/students/' + studentId + '/attendance');
        if (!res.ok) throw new Error('فشل جلب سجل الحضور');
        const records = await res.json();
        parentLogs = records.map(r => ({
            message: r.statusText || (r.status === 'in' ? translate('attendance.entry') : translate('attendance.exit')),
            studentName: r.studentName || '',
            time: formatFullTime(r.timestamp),
            date: new Date(r.timestamp)
        }));
        renderParentLogs(parentShowOldLogs);
    } catch (err) {
        console.error(err);
    }
}

async function loadParentLogs() {
    renderParentLogs(parentShowOldLogs);
}

function renderParentLogs(showOld) {
    const container = document.getElementById('parentLogContainer');
    if (!container) return;

    document.getElementById('parentShowOldLogsBtn').style.display = 'none';
    document.getElementById('parentHideOldLogsBtn').style.display = 'none';

    if (parentLogs.length === 0) {
        container.innerHTML = '<div class="log-item" style="color:#8a9aaa; justify-content:center;">لا توجد سجلات بعد</div>';
        return;
    }

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
        logsToShow = todayLogs.slice(0, 5);
        if (oldLogs.length > 0 || todayLogs.length > 5) {
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
        const displayMessage = log.studentName ? `${log.studentName}: ${log.message}` : log.message;
        item.innerHTML = `<span>${displayMessage}</span><span class="log-time">${log.time}</span>`;
        container.appendChild(item);
    });
}

    if (showOld && oldLogs.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'log-item';
        divider.style.cssText = 'border-top:2px dashed #ccc; margin:10px 0; padding:5px; text-align:center; color:#8a9aaa; font-size:13px;';
        divider.textContent = '📜 السجل السابق';
        container.appendChild(divider);
    }
}

function toggleParentOldLogs(show) {
    parentShowOldLogs = show;
    renderParentLogs(parentShowOldLogs);
}

// ==========================================
// 19. أحداث المصادقة وربط الأحداث
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
