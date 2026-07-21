// ==========================================
// 1. رابط الخادم
// ==========================================
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = isLocal 
    ? 'http://localhost:5000' 
    : 'https://studenttracker-zgom.onrender.com';
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

// ✅ متغيرات النظام متعدد المؤسسات
let currentTenantSubdomain = localStorage.getItem('tenantSubdomain') || 'demo';
let tenants = [];

// ✅ دالة لتحديث subdomain في كل طلب
function getTenantSubdomain() {
    return currentTenantSubdomain;
}

// ==========================================
// 3. دوال API مع التوكن (معدلة لإضافة subdomain)
// ==========================================
function fetchWithAuth(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'x-tenant-subdomain': getTenantSubdomain(),
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
// 4. دوال المصادقة (معدلة لإضافة subdomain في طلب login/register)
// ==========================================
function setupAuthEvents() {
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) return alert('املأ جميع الحقول');
        try {
            const res = await fetch(API_BASE_URL + '/api/auth/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tenant-subdomain': getTenantSubdomain()
                },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل تسجيل الدخول');
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
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tenant-subdomain': getTenantSubdomain()
                },
                body: JSON.stringify({ name, email, password, phone, role })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل التسجيل');
            saveAuth(data);
        } catch (err) {
            alert(err.message || 'فشل التسجيل');
        }
    });

// ==========================================
// 3. نظام الترجمات (i18n)
// ==========================================
let currentLanguage = localStorage.getItem('language') || 'ar';
let translations = {};

async function loadTranslations(lang) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/i18n/${lang}`);
        if (!res.ok) throw new Error('فشل تحميل الترجمات');
        translations = await res.json();
        currentLanguage = lang;
        localStorage.setItem('language', lang);
        applyTranslations();
    } catch (err) {
        console.error('❌ خطأ في تحميل الترجمات:', err);
    }
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = getTranslation(key);
        if (translation) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        }
    });
}

function getTranslation(key, params = {}) {
    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            return key;
        }
    }
    if (typeof value === 'string') {
        for (const [paramKey, paramValue] of Object.entries(params)) {
            value = value.replace(`{${paramKey}}`, paramValue);
        }
    }
    return value;
}

function switchLanguage(lang) {
    if (lang === currentLanguage) return;
    loadTranslations(lang);
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

// ==========================================
// 4. دوال مساعدة
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
// 5. نافذة التأكيد (Modal)
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
// 6. دوال المصادقة
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

    const dashboard = document.getElementById(currentUser.role === 'super_admin' ? 'superAdminDashboard' : 
                                           currentUser.role === 'admin' ? 'adminDashboard' : 'parentDashboard');
    if (dashboard) {
        // إخفاء جميع اللوحات
        document.querySelectorAll('#adminDashboard, #parentDashboard, #superAdminDashboard').forEach(el => el.style.display = 'none');
        dashboard.style.display = 'block';
    }
    
    if (currentUser.role === 'super_admin') {
        connectSocket();
        loadTenants();
    } else if (currentUser.role === 'admin') {
        connectSocket();
        loadSchoolSettings();
        loadAdminStudents();
        loadAdminLogs();
        loadAdminNotifications();
    } else {
        connectSocket();
        loadParentStudents();
        loadParentLogs();
        loadParentNotifications();
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
    const elements = ['loginScreen', 'registerScreen', 'adminDashboard', 'parentDashboard', 'superAdminDashboard'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === 'loginScreen' ? 'block' : 'none';
    });
}

function showRegister() {
    const elements = ['loginScreen', 'registerScreen', 'adminDashboard', 'parentDashboard', 'superAdminDashboard'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === 'registerScreen' ? 'block' : 'none';
    });
}

// ==========================================
// 7. Socket.io
// ==========================================
function connectSocket() {
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(SOCKET_URL, { 
        auth: { token },
        transportOptions: {
            polling: {
                extraHeaders: {
                    'x-tenant-subdomain': currentTenantSubdomain
                }
            }
        }
    });

    socket.on('connect', () => console.log('✅ Socket متصل'));

    socket.on('status-changed', (data) => {
        if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
            loadAdminStudents();
            loadAdminLogs();
        } else {
            if (data.parentEmail === currentUser.email || data.parentId === currentUser.id) {
                loadParentStudents();
                loadParentLogs();
                showBrowserNotification('تحديث حالة ابنك', data.message);
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
        } else if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
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
// 8. دوال API مع التوكن
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
    // إضافة subdomain فقط إذا لم يكن الطلب للمسارات العامة
    if (!url.startsWith('/api/auth/') && !url.startsWith('/api/i18n/')) {
        headers['x-tenant-subdomain'] = currentTenantSubdomain;
    }

    return fetch(API_BASE_URL + url, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
}

// ==========================================
// 9. دوال إعدادات المدرسة (يتم استدعاؤها فقط عندما يكون المستخدم مديراً)
// ==========================================
async function loadSchoolSettings() {
    try {
        const res = await fetchWithAuth('/api/settings');
        if (!res.ok) throw new Error('فشل جلب إعدادات المدرسة');
        schoolSettings = await res.json();
        applySchoolSettings();
    } catch (err) {
        console.error('❌ خطأ في جلب إعدادات المدرسة:', err);
    }
}

function applySchoolSettings() {
    if (!schoolSettings) return;
    const nameEl = document.getElementById('schoolName');
    const addressEl = document.getElementById('schoolAddress');
    const contactEl = document.getElementById('schoolContact');
    const logoImg = document.getElementById('schoolLogo');
    
    if (nameEl) nameEl.textContent = schoolSettings.schoolName || 'مدرسة النور الابتدائية';
    if (addressEl) addressEl.textContent = '📍 ' + (schoolSettings.address || 'العنوان غير محدد');
    if (contactEl) contactEl.textContent = '📞 ' + (schoolSettings.phone || '') + ' | ✉️ ' + (schoolSettings.email || '');
    
    if (logoImg) {
        if (schoolSettings.logo && schoolSettings.logo.length > 0) {
            logoImg.src = schoolSettings.logo;
            logoImg.style.display = 'inline-block';
        } else {
            logoImg.style.display = 'none';
        }
    }

    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin')) {
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            const inputs = {
                settingsSchoolName: schoolSettings.schoolName || '',
                settingsAddress: schoolSettings.address || '',
                settingsPhone: schoolSettings.phone || '',
                settingsEmail: schoolSettings.email || '',
            };
            Object.entries(inputs).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.value = value;
            });
            const preview = document.getElementById('logoPreview');
            if (preview) {
                if (schoolSettings.logo) {
                    preview.innerHTML = `<img src="${schoolSettings.logo}" alt="الشعار الحالي">`;
                } else {
                    preview.innerHTML = '<span style="color:#8a9aaa;">لا يوجد شعار حالياً</span>';
                }
            }
        }
    }
}

async function saveSchoolSettings() {
    const schoolName = document.getElementById('settingsSchoolName')?.value.trim() || '';
    const address = document.getElementById('settingsAddress')?.value.trim() || '';
    const phone = document.getElementById('settingsPhone')?.value.trim() || '';
    const email = document.getElementById('settingsEmail')?.value.trim() || '';
    
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

    const confirmed = await showConfirmModal('حفظ إعدادات المدرسة', 'هل أنت متأكد من حفظ التغييرات؟');
    if (!confirmed) return;

    try {
        const res = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ schoolName, address, phone, email, logo, logoFileName })
        });
        if (!res.ok) throw new Error('فشل حفظ الإعدادات');
        const data = await res.json();
        schoolSettings = data;
        applySchoolSettings();
        alert('تم حفظ إعدادات المدرسة بنجاح');
        const form = document.getElementById('settingsForm');
        if (form) form.style.display = 'none';
        const btn = document.getElementById('toggleSettingsBtn');
        if (btn) btn.innerHTML = '<i class="fas fa-cog"></i> إعدادات المؤسسة';
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

function toggleSettingsForm() {
    const form = document.getElementById('settingsForm');
    const btn = document.getElementById('toggleSettingsBtn');
    if (!form || !btn) return;
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-times"></i> إغلاق الإعدادات';
        if (schoolSettings) {
            const fields = ['settingsSchoolName', 'settingsAddress', 'settingsPhone', 'settingsEmail'];
            fields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = schoolSettings[id.replace('settings', '').toLowerCase()] || '';
            });
            const preview = document.getElementById('logoPreview');
            if (preview) {
                if (schoolSettings.logo) {
                    preview.innerHTML = `<img src="${schoolSettings.logo}" alt="الشعار الحالي">`;
                } else {
                    preview.innerHTML = '<span style="color:#8a9aaa;">لا يوجد شعار حالياً</span>';
                }
            }
        }
    } else {
        form.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-cog"></i> إعدادات المؤسسة';
    }
}

document.getElementById('settingsLogoUpload')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const preview = document.getElementById('logoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${event.target.result}" alt="الشعار الجديد">`;
            }
        };
        reader.readAsDataURL(file);
    }
});

// ==========================================
// 10. دوال QR Code
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
    if (resultsContainer) resultsContainer.innerHTML = '📷 جاري طلب الإذن للكاميرا...';

    if (typeof Html5Qrcode === 'undefined') {
        if (resultsContainer) resultsContainer.innerHTML = '❌ مكتبة المسح غير محملة، تحقق من اتصال الإنترنت.';
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
    if (resultsContainer) resultsContainer.innerHTML = '📷 جاري الوصول للكاميرا...';

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
                if (resultsContainer) resultsContainer.innerHTML = `✅ تم اختيار الكاميرا: ${selectedCamera.label || 'غير معروف'}`;
                
                const switchBtn = document.getElementById('switchCameraBtn');
                if (switchBtn) {
                    if (devices.length > 1) {
                        switchBtn.style.display = 'inline-block';
                    } else {
                        switchBtn.style.display = 'none';
                    }
                }

                startNewScanner(currentCameraId);
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

function startNewScanner(cameraId) {
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = '⏳ جاري تشغيل الكاميرا...';

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
        if (resultsContainer) resultsContainer.innerHTML = '📸 الكاميرا تعمل، ضع الكود أمامها';
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
    if (resultsContainer) resultsContainer.innerHTML = '✅ جاري معالجة الكود...';

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
            if (resultsContainer) resultsContainer.innerHTML = '✅ ' + data.message;
            if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
                loadAdminStudents();
                loadAdminLogs();
            } else {
                loadParentStudents();
                loadParentLogs();
            }
            setTimeout(closeScanner, 2000);
        } else {
            if (resultsContainer) resultsContainer.innerHTML = '❌ ' + data.message;
            if (html5QrCode) html5QrCode.resume();
        }
    })
    .catch(err => {
        if (resultsContainer) resultsContainer.innerHTML = '❌ خطأ في الاتصال بالخادم';
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
    const modal = document.getElementById('scannerModal');
    if (modal) modal.style.display = 'none';
    const results = document.getElementById('qr-reader-results');
    if (results) results.innerHTML = '';
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) switchBtn.style.display = 'none';
}

// ربط أحداث الماسح
document.getElementById('openScannerBtn')?.addEventListener('click', openScanner);
document.getElementById('closeScannerBtn')?.addEventListener('click', closeScanner);
document.getElementById('switchCameraBtn')?.addEventListener('click', switchCamera);

// ==========================================
// 11. دوال الإشعارات (Web Push)
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
// 12. دوال الإشعارات (داخل التطبيق)
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
    if (!list) return;
    list.innerHTML = '';

    if (allNotifications.length === 0) {
        list.innerHTML = '<li style="color:#8a9aaa; text-align:center; padding:20px;">📭 لا توجد إشعارات حالياً</li>';
        const showBtn = document.getElementById('showOldNotificationsBtn');
        const hideBtn = document.getElementById('hideOldNotificationsBtn');
        if (showBtn) showBtn.style.display = 'none';
        if (hideBtn) hideBtn.style.display = 'none';
        return;
    }

    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    const recentCount = Math.max(unreadCount, 3);
    
    let newNotifications = [];
    let oldNotifications = [];

    if (showOld) {
        newNotifications = allNotifications;
        oldNotifications = [];
        const showBtn = document.getElementById('showOldNotificationsBtn');
        const hideBtn = document.getElementById('hideOldNotificationsBtn');
        if (showBtn) showBtn.style.display = 'none';
        if (hideBtn) hideBtn.style.display = 'block';
    } else {
        newNotifications = allNotifications.slice(0, recentCount);
        oldNotifications = allNotifications.slice(recentCount);
        
        const showBtn = document.getElementById('showOldNotificationsBtn');
        const hideBtn = document.getElementById('hideOldNotificationsBtn');
        if (oldNotifications.length > 0) {
            if (showBtn) showBtn.style.display = 'inline-flex';
            if (hideBtn) hideBtn.style.display = 'none';
        } else {
            if (showBtn) showBtn.style.display = 'none';
            if (hideBtn) hideBtn.style.display = 'none';
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
    if (!list) return;
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
// 13. دوال التغيير الجماعي
// ==========================================
async function toggleAllStudents(status) {
    const statusText = status ? 'داخل 🏫' : 'خارج 🚪';
    const confirmed = await showConfirmModal('تغيير حالة جميع الطلاب', `هل أنت متأكد من تغيير حالة جميع الطلاب إلى ${statusText}؟`);
    if (!confirmed) return;

    if (socket) {
        socket.emit('toggle-all-status', { newStatus: status });
        addLog(`🔄 تم تغيير حالة جميع الطلاب إلى ${statusText}`, new Date(), 'adminLogContainer');
    } else {
        alert('Socket غير متصل');
    }
}

// ==========================================
// 14. دوال المدير
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
        container.innerHTML = '<div class="loading-state">📭 لا يوجد تلاميذ</div>';
        return;
    }
    let html = '';
    students.forEach(s => {
        const statusText = getStatusText(s.isInside);
        const statusClass = getStatusClass(s.isInside);
        const toggleText = s.isInside ? 'تسجيل خروج' : 'تسجيل دخول';
        const toggleClass = s.isInside ? 'exit' : 'enter';

        html += `
            <div class="student-card" data-id="${s._id}">
                <div>
                    <div class="student-name">${s.name} (${s.studentId})</div>
                    <div style="font-size:14px;color:#4a5a6e;">ولي الأمر: ${s.parentName}</div>
                    <div style="font-size:13px;color:#6a7a8e;">📞 ${s.parentPhone}</div>
                    <span class="student-time">🕒 آخر تحديث: ${formatFullTime(s.lastUpdate)}</span>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="card-actions">
                    ${showAdminControls ? `
                        <button class="btn-toggle ${toggleClass}" onclick="adminToggle('${s._id}')">${toggleText}</button>
                        <button class="btn-delete" onclick="adminDelete('${s._id}')">🗑️</button>
                        <button class="btn-edit" onclick="openEditStudent('${s._id}')"><i class="fas fa-edit"></i> تعديل</button>
                    ` : `
                        <span style="font-size:13px;color:#7b8b9e;">آخر دخول/خروج: ${formatFullTime(s.lastUpdate)}</span>
                    `}
                    <button class="btn-qr" onclick="downloadQR('${s._id}')"><i class="fas fa-qrcode"></i> QR</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.adminToggle = async function(id) {
    const confirmed = await showConfirmModal('تغيير حالة الطالب', 'هل أنت متأكد من تغيير حالة هذا الطالب؟');
    if (!confirmed) return;

    fetchWithAuth('/api/students/' + id + '/toggle', { method: 'PUT' })
        .then(res => {
            if (!res.ok) throw new Error('فشل تغيير الحالة');
            return res.json();
        })
        .then(() => {
            loadAdminStudents();
            addLog('🔄 تم تغيير حالة الطالب', new Date(), 'adminLogContainer');
        })
        .catch(err => alert('خطأ: ' + err.message));
};

window.adminDelete = async function(id) {
    const confirmed = await showConfirmModal('حذف الطالب', 'هل أنت متأكد من حذف هذا الطالب نهائياً؟');
    if (!confirmed) return;

    fetchWithAuth('/api/students/' + id, { method: 'DELETE' })
        .then(() => {
            loadAdminStudents();
            addLog('🗑️ تم حذف تلميذ', new Date(), 'adminLogContainer');
        })
        .catch(err => alert('خطأ في الحذف'));
};

// ==========================================
// 15. تعديل معلومات الطالب
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

        const idEl = document.getElementById('editStudentId');
        const nameEl = document.getElementById('editName');
        const pNameEl = document.getElementById('editParentName');
        const pPhoneEl = document.getElementById('editParentPhone');
        const pEmailEl = document.getElementById('editParentEmail');
        const addrEl = document.getElementById('editAddress');
        if (idEl) idEl.value = student._id;
        if (nameEl) nameEl.value = student.name || '';
        if (pNameEl) pNameEl.value = student.parentName || '';
        if (pPhoneEl) pPhoneEl.value = student.parentPhone || '';
        if (pEmailEl) pEmailEl.value = student.parentEmail || '';
        if (addrEl) addrEl.value = student.address || '';
        const modal = document.getElementById('editStudentModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        alert('خطأ في جلب بيانات الطالب: ' + err.message);
    }
};

document.getElementById('saveEditStudentBtn')?.addEventListener('click', async function() {
    const id = document.getElementById('editStudentId')?.value;
    const name = document.getElementById('editName')?.value?.trim() || '';
    const parentName = document.getElementById('editParentName')?.value?.trim() || '';
    const parentPhone = document.getElementById('editParentPhone')?.value?.trim() || '';
    const parentEmail = document.getElementById('editParentEmail')?.value?.trim() || '';
    const address = document.getElementById('editAddress')?.value?.trim() || '';

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
        const modal = document.getElementById('editStudentModal');
        if (modal) modal.style.display = 'none';
        loadAdminStudents();
        addLog('✏️ تم تعديل معلومات الطالب ' + name, new Date(), 'adminLogContainer');
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
});

document.getElementById('closeEditStudentBtn')?.addEventListener('click', function() {
    const modal = document.getElementById('editStudentModal');
    if (modal) modal.style.display = 'none';
});

// ==========================================
// 16. عرض جميع سجلات النشاطات في نافذة منبثقة
// ==========================================
document.getElementById('adminShowAllLogsBtn')?.addEventListener('click', function() {
    const container = document.getElementById('allLogsContainer');
    if (!container) return;
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
    
    const modal = document.getElementById('allLogsModal');
    if (modal) modal.style.display = 'flex';
});

document.getElementById('closeAllLogsBtn')?.addEventListener('click', function() {
    const modal = document.getElementById('allLogsModal');
    if (modal) modal.style.display = 'none';
});

// إغلاق النوافذ المنبثقة عند الضغط خارجها
document.getElementById('allLogsModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

document.getElementById('editStudentModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

// ==========================================
// 17. دوال المدير (إضافة طالب، إشعارات، إلخ)
// ==========================================
async function adminAddStudent() {
    const name = document.getElementById('adminStudentName')?.value?.trim() || '';
    const parentEmail = document.getElementById('adminParentEmail')?.value?.trim() || '';
    const parentName = document.getElementById('adminParentName')?.value?.trim() || '';
    const parentPhone = document.getElementById('adminParentPhone')?.value?.trim() || '';
    const address = document.getElementById('adminAddress')?.value?.trim() || '';
    if (!name || !parentEmail || !parentName || !parentPhone) {
        alert('جميع الحقول مطلوبة ما عدا العنوان');
        return;
    }

    const confirmed = await showConfirmModal('إضافة طالب جديد', `تأكيد إضافة الطالب "${name}" لولي الأمر "${parentName}"؟`);
    if (!confirmed) return;

    const res = await fetchWithAuth('/api/students', {
        method: 'POST',
        body: JSON.stringify({ name, parentEmail, parentName, parentPhone, address })
    });
    if (res.ok) {
        const inputs = ['adminStudentName', 'adminParentEmail', 'adminParentName', 'adminParentPhone', 'adminAddress'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        loadAdminStudents();
        addLog('➕ تم إضافة الطالب ' + name, new Date(), 'adminLogContainer');
        const form = document.getElementById('addStudentForm');
        if (form) form.style.display = 'none';
        const btn = document.getElementById('toggleAddStudentBtn');
        if (btn) btn.textContent = '➕ إضافة طالب جديد';
    } else {
        const data = await res.json();
        alert(data.message || 'حدث خطأ');
    }
}

function toggleAddStudentForm() {
    const form = document.getElementById('addStudentForm');
    const btn = document.getElementById('toggleAddStudentBtn');
    if (!form || !btn) return;
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-times"></i> إغلاق نموذج الإضافة';
    } else {
        form.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-plus-circle"></i> إضافة طالب جديد';
    }
}

async function adminSendGeneralNotification() {
    const msg = document.getElementById('adminNotificationMsg')?.value?.trim() || '';
    if (!msg) return alert('اكتب رسالة الإشعار');
    
    const confirmed = await showConfirmModal('إرسال إشعار عام', 'هل أنت متأكد من إرسال هذا الإشعار لجميع أولياء الأمور؟');
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification', { message: msg });
        const el = document.getElementById('adminNotificationMsg');
        if (el) el.value = '';
        addLog('📢 تم إرسال إشعار عام', new Date(), 'adminLogContainer');
    } else {
        alert('Socket غير متصل');
    }
}

async function adminSendParentNotification() {
    const email = document.getElementById('adminParentEmailInput')?.value?.trim() || '';
    const msg = document.getElementById('adminParentNotificationMsg')?.value?.trim() || '';
    if (!email || !msg) return alert('املأ جميع الحقول');
    
    const confirmed = await showConfirmModal('إرسال إشعار خاص', `هل أنت متأكد من إرسال هذا الإشعار لولي الأمر (${email})؟`);
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification-to-parent', { parentEmail: email, message: msg });
        const emailEl = document.getElementById('adminParentEmailInput');
        const msgEl = document.getElementById('adminParentNotificationMsg');
        if (emailEl) emailEl.value = '';
        if (msgEl) msgEl.value = '';
    } else {
        alert('Socket غير متصل');
    }
}

// ==========================================
// 18. دوال السجل
// ==========================================
function addLog(message, date, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const time = formatFullTime(date || new Date());
    const logEntry = { message, time, date: date || new Date() };

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

    const showBtn = document.getElementById('adminShowOldLogsBtn');
    const hideBtn = document.getElementById('adminHideOldLogsBtn');
    const allBtn = document.getElementById('adminShowAllLogsBtn');
    if (showBtn) showBtn.style.display = 'none';
    if (hideBtn) hideBtn.style.display = 'none';
    if (allBtn) allBtn.style.display = 'none';

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
        if (showBtn) showBtn.style.display = 'none';
        if (hideBtn) hideBtn.style.display = 'inline-flex';
        if (allBtn) allBtn.style.display = 'none';
    } else {
        const todayOnly = todayLogs.length > 0 ? todayLogs : sortedLogs.slice(0, 5);
        logsToShow = todayOnly.slice(0, 5);
        
        if (oldLogs.length > 0 || todayLogs.length > 5) {
            if (showBtn) showBtn.style.display = 'inline-flex';
            if (hideBtn) hideBtn.style.display = 'none';
            if (sortedLogs.length > 5 && allBtn) allBtn.style.display = 'inline-flex';
        } else {
            if (showBtn) showBtn.style.display = 'none';
            if (hideBtn) hideBtn.style.display = 'none';
            if (allBtn) allBtn.style.display = 'none';
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
        divider.textContent = '📜 السجل السابق';
        container.appendChild(divider);
    }
}

function toggleAdminOldLogs(show) {
    adminShowOldLogs = show;
    renderAdminLogs(adminShowOldLogs);
}

// ==========================================
// 19. دوال ولي الأمر
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
            message: r.status === 'in' ? 'دخول' : 'خروج',
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

    const showBtn = document.getElementById('parentShowOldLogsBtn');
    const hideBtn = document.getElementById('parentHideOldLogsBtn');
    if (showBtn) showBtn.style.display = 'none';
    if (hideBtn) hideBtn.style.display = 'none';

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
        if (showBtn) showBtn.style.display = 'none';
        if (hideBtn) hideBtn.style.display = 'inline-flex';
    } else {
        logsToShow = todayLogs.slice(0, 5);
        if (oldLogs.length > 0 || todayLogs.length > 5) {
            if (showBtn) showBtn.style.display = 'inline-flex';
            if (hideBtn) hideBtn.style.display = 'none';
        } else {
            if (showBtn) showBtn.style.display = 'none';
            if (hideBtn) hideBtn.style.display = 'none';
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
        divider.textContent = '📜 السجل السابق';
        container.appendChild(divider);
    }
}

function toggleParentOldLogs(show) {
    parentShowOldLogs = show;
    renderParentLogs(parentShowOldLogs);
}

// ==========================================
// 20. دوال المدير العام (Super Admin)
// ==========================================
async function loadTenants() {
    try {
        const res = await fetchWithAuth('/api/tenants');
        if (!res.ok) throw new Error('فشل جلب المؤسسات');
        tenants = await res.json();
        renderTenants();
    } catch (err) {
        console.error(err);
        const list = document.getElementById('tenantsList');
        if (list) list.innerHTML = '<div class="loading-state">❌ فشل تحميل المؤسسات</div>';
    }
}

function renderTenants() {
    const container = document.getElementById('tenantsList');
    if (!container) return;

    if (tenants.length === 0) {
        container.innerHTML = '<div class="loading-state">📭 لا توجد مؤسسات مسجلة</div>';
        return;
    }

    let html = '<div class="tenants-grid">';
    tenants.forEach(t => {
        html += `
            <div class="tenant-card">
                <div class="tenant-header">
                    <h3>${t.name}</h3>
                    <span class="tenant-status ${t.isActive ? 'active' : 'inactive'}">${t.isActive ? '✅ نشط' : '❌ غير نشط'}</span>
                </div>
                <div class="tenant-info">
                    <p><strong>النطاق الفرعي:</strong> ${t.subdomain}</p>
                    <p><strong>البريد:</strong> ${t.email || 'غير محدد'}</p>
                    <p><strong>الهاتف:</strong> ${t.phone || 'غير محدد'}</p>
                    <p><strong>المدير:</strong> ${t.adminId ? t.adminId.name : 'غير معين'}</p>
                </div>
                <div class="tenant-actions">
                    <button class="btn-edit" onclick="editTenant('${t._id}')"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn-toggle" onclick="toggleTenantStatus('${t._id}')">${t.isActive ? 'تعطيل' : 'تفعيل'}</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ==========================================
// 21. أحداث المصادقة وربط الأحداث
// ==========================================
function setupAuthEvents() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const logoutBtns = ['logoutBtnAdmin', 'logoutBtnParent', 'logoutBtnSuperAdmin'];
    const settingsBtn = document.getElementById('toggleSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const addStudentBtn = document.getElementById('toggleAddStudentBtn');
    const adminAddBtn = document.getElementById('adminAddBtn');
    const sendNotifBtn = document.getElementById('adminSendNotificationBtn');
    const sendParentNotifBtn = document.getElementById('adminSendParentNotificationBtn');
    const toggleInsideBtn = document.getElementById('toggleAllInsideBtn');
    const toggleOutsideBtn = document.getElementById('toggleAllOutsideBtn');
    const adminShowOldBtn = document.getElementById('adminShowOldLogsBtn');
    const adminHideOldBtn = document.getElementById('adminHideOldLogsBtn');
    const parentShowOldBtn = document.getElementById('parentShowOldLogsBtn');
    const parentHideOldBtn = document.getElementById('parentHideOldLogsBtn');
    const showOldNotifBtn = document.getElementById('showOldNotificationsBtn');
    const hideOldNotifBtn = document.getElementById('hideOldNotificationsBtn');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail')?.value || '';
            const password = document.getElementById('loginPassword')?.value || '';
            if (!email || !password) return alert('املأ جميع الحقول');
            try {
                const res = await fetch(API_BASE_URL + '/api/auth/login', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-tenant-subdomain': currentTenantSubdomain 
                    },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                saveAuth(data);
            } catch (err) {
                alert(err.message || 'فشل تسجيل الدخول');
            }
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            const name = document.getElementById('regName')?.value?.trim() || '';
            const email = document.getElementById('regEmail')?.value?.trim() || '';
            const password = document.getElementById('regPassword')?.value?.trim() || '';
            const phone = document.getElementById('regPhone')?.value?.trim() || '';
            const role = document.getElementById('regRole')?.value || 'parent';
            if (!name || !email || !password || !phone) return alert('املأ جميع الحقول');
            if (password.length < 6) return alert('كلمة المرور 6 أحرف على الأقل');
            try {
                const res = await fetch(API_BASE_URL + '/api/auth/register', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-tenant-subdomain': currentTenantSubdomain 
                    },
                    body: JSON.stringify({ name, email, password, phone, role })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                saveAuth(data);
            } catch (err) {
                alert(err.message || 'فشل التسجيل');
            }
        });
    }

    if (showRegisterLink) showRegisterLink.addEventListener('click', showRegister);
    if (showLoginLink) showLoginLink.addEventListener('click', showLogin);
    logoutBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', logout);
    });

    if (settingsBtn) settingsBtn.addEventListener('click', toggleSettingsForm);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSchoolSettings);
    if (addStudentBtn) addStudentBtn.addEventListener('click', toggleAddStudentForm);
    if (adminAddBtn) adminAddBtn.addEventListener('click', adminAddStudent);
    if (sendNotifBtn) sendNotifBtn.addEventListener('click', adminSendGeneralNotification);
    if (sendParentNotifBtn) sendParentNotifBtn.addEventListener('click', adminSendParentNotification);
    
    if (toggleInsideBtn) {
        toggleInsideBtn.addEventListener('click', function() {
            toggleAllStudents(true);
        });
    }
    if (toggleOutsideBtn) {
        toggleOutsideBtn.addEventListener('click', function() {
            toggleAllStudents(false);
        });
    }

    if (adminShowOldBtn) adminShowOldBtn.addEventListener('click', function() { toggleAdminOldLogs(true); });
    if (adminHideOldBtn) adminHideOldBtn.addEventListener('click', function() { toggleAdminOldLogs(false); });
    if (parentShowOldBtn) parentShowOldBtn.addEventListener('click', function() { toggleParentOldLogs(true); });
    if (parentHideOldBtn) parentHideOldBtn.addEventListener('click', function() { toggleParentOldLogs(false); });
    if (showOldNotifBtn) showOldNotifBtn.addEventListener('click', function() { toggleOldNotifications(true); });
    if (hideOldNotifBtn) hideOldNotifBtn.addEventListener('click', function() { toggleOldNotifications(false); });
}

// ==========================================
// 22. بدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // تحميل الترجمات
    loadTranslations(currentLanguage);
    
    // إضافة زر تبديل اللغة (إذا لم يكن موجوداً)
    if (!document.querySelector('.lang-switcher')) {
        const langSwitcher = document.createElement('div');
        langSwitcher.className = 'lang-switcher';
        langSwitcher.innerHTML = `
            <button data-lang="ar" class="lang-btn ${currentLanguage === 'ar' ? 'active' : ''}" onclick="switchLanguage('ar')">🇸🇦 عربي</button>
            <button data-lang="en" class="lang-btn ${currentLanguage === 'en' ? 'active' : ''}" onclick="switchLanguage('en')">🇬🇧 English</button>
            <button data-lang="fr" class="lang-btn ${currentLanguage === 'fr' ? 'active' : ''}" onclick="switchLanguage('fr')">🇫🇷 Français</button>
        `;
        const header = document.querySelector('header');
        if (header) {
            header.appendChild(langSwitcher);
        }
    }

    // تحميل إعدادات المدرسة (لكن فقط إذا كان المستخدم مديراً)
    // لا نحاول تحميلها قبل تسجيل الدخول لتجنب أخطاء 404
    setupAuthEvents();

    if (token) {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (user) {
                currentUser = user;
                if (currentUser.role === 'super_admin') {
                    document.querySelectorAll('#adminDashboard, #parentDashboard, #superAdminDashboard').forEach(el => el.style.display = 'none');
                    const dash = document.getElementById('superAdminDashboard');
                    if (dash) dash.style.display = 'block';
                    connectSocket();
                    loadTenants();
                } else if (currentUser.role === 'admin') {
                    document.querySelectorAll('#adminDashboard, #parentDashboard, #superAdminDashboard').forEach(el => el.style.display = 'none');
                    const dash = document.getElementById('adminDashboard');
                    if (dash) dash.style.display = 'block';
                    connectSocket();
                    loadSchoolSettings();
                    loadAdminStudents();
                    loadAdminLogs();
                    loadAdminNotifications();
                } else {
                    document.querySelectorAll('#adminDashboard, #parentDashboard, #superAdminDashboard').forEach(el => el.style.display = 'none');
                    const dash = document.getElementById('parentDashboard');
                    if (dash) dash.style.display = 'block';
                    connectSocket();
                    loadParentStudents();
                    loadParentLogs();
                    loadParentNotifications();
                }
                return;
            }
        } catch(e) {}
    }
    showLogin();
});
