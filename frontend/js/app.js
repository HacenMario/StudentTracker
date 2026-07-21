// ==========================================
// 1. رابط الخادم (تلقائي حسب البيئة)
// ==========================================
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = isLocal 
    ? 'http://localhost:5000' 
    : 'https://studenttracker-zgom.onrender.com';
const SOCKET_URL = API_BASE_URL;

// ==========================================
// 2. المتغيرات العامة
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

// متغيرات النظام متعدد المؤسسات
let currentTenantSubdomain = localStorage.getItem('tenantSubdomain') || 'demo';
let tenants = [];

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
        const modal = document.getElementById('confirmModal');
        if (!modal) {
            console.warn('⚠️ confirmModal غير موجود');
            resolve(false);
            return;
        }
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        modal.style.display = 'flex';
        modalResolve = resolve;
    });
}

document.getElementById('modalConfirmBtn')?.addEventListener('click', function() {
    document.getElementById('confirmModal').style.display = 'none';
    if (modalResolve) modalResolve(true);
});

document.getElementById('modalCancelBtn')?.addEventListener('click', function() {
    document.getElementById('confirmModal').style.display = 'none';
    if (modalResolve) modalResolve(false);
});

// ==========================================
// 6. دوال المصادقة والعرض
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

    if (currentUser.role === 'super_admin') {
        showSuperAdminDashboard();
    } else if (currentUser.role === 'admin') {
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

function hideAllScreens() {
    ['loginScreen', 'registerScreen', 'adminDashboard', 'parentDashboard', 'superAdminDashboard'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showLogin() {
    hideAllScreens();
    const el = document.getElementById('loginScreen');
    if (el) el.style.display = 'block';
}

function showRegister() {
    hideAllScreens();
    const el = document.getElementById('registerScreen');
    if (el) el.style.display = 'block';
}

function showAdminDashboard() {
    hideAllScreens();
    const el = document.getElementById('adminDashboard');
    if (el) el.style.display = 'block';
    connectSocket();
    loadSchoolSettings();
    loadAdminStudents();
    loadAdminLogs();
    loadAdminNotifications();
}

function showParentDashboard() {
    hideAllScreens();
    const el = document.getElementById('parentDashboard');
    if (el) el.style.display = 'block';
    connectSocket();
    loadParentStudents();
    loadParentLogs();
    loadParentNotifications();
}

function showSuperAdminDashboard() {
    hideAllScreens();
    const el = document.getElementById('superAdminDashboard');
    if (el) el.style.display = 'block';
    connectSocket();
    loadTenants();
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
function getTenantSubdomain() {
    return currentTenantSubdomain;
}

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
// 9. دوال إعدادات المدرسة
// ==========================================
async function loadSchoolSettings() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/settings`);
        if (!res.ok) throw new Error('فشل جلب إعدادات المدرسة');
        schoolSettings = await res.json();
        applySchoolSettings();
    } catch (err) {
        console.error(err);
    }
}

function applySchoolSettings() {
    if (!schoolSettings) return;
    const nameEl = document.getElementById('schoolName');
    const addrEl = document.getElementById('schoolAddress');
    const contactEl = document.getElementById('schoolContact');
    const logoImg = document.getElementById('schoolLogo');
    if (nameEl) nameEl.textContent = schoolSettings.schoolName || 'مدرسة النور الابتدائية';
    if (addrEl) addrEl.textContent = '📍 ' + (schoolSettings.address || 'العنوان غير محدد');
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
        const settingsName = document.getElementById('settingsSchoolName');
        const settingsAddr = document.getElementById('settingsAddress');
        const settingsPhone = document.getElementById('settingsPhone');
        const settingsEmail = document.getElementById('settingsEmail');
        const preview = document.getElementById('logoPreview');
        if (settingsName) settingsName.value = schoolSettings.schoolName || '';
        if (settingsAddr) settingsAddr.value = schoolSettings.address || '';
        if (settingsPhone) settingsPhone.value = schoolSettings.phone || '';
        if (settingsEmail) settingsEmail.value = schoolSettings.email || '';
        if (preview) {
            if (schoolSettings.logo) {
                preview.innerHTML = `<img src="${schoolSettings.logo}" alt="الشعار الحالي">`;
            } else {
                preview.innerHTML = '<span style="color:#8a9aaa;">لا يوجد شعار حالياً</span>';
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
        const btn = document.getElementById('toggleSettingsBtn');
        if (form) form.style.display = 'none';
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
            const settingsName = document.getElementById('settingsSchoolName');
            const settingsAddr = document.getElementById('settingsAddress');
            const settingsPhone = document.getElementById('settingsPhone');
            const settingsEmail = document.getElementById('settingsEmail');
            const preview = document.getElementById('logoPreview');
            if (settingsName) settingsName.value = schoolSettings.schoolName || '';
            if (settingsAddr) settingsAddr.value = schoolSettings.address || '';
            if (settingsPhone) settingsPhone.value = schoolSettings.phone || '';
            if (settingsEmail) settingsEmail.value = schoolSettings.email || '';
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

const settingsLogoUpload = document.getElementById('settingsLogoUpload');
if (settingsLogoUpload) {
    settingsLogoUpload.addEventListener('change', function(e) {
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
}

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
    const resultsContainer = document.getElementById('qr-reader-results');
    if (resultsContainer) resultsContainer.innerHTML = '';
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) switchBtn.style.display = 'none';
}

// ربط أزرار الماسح الضوئي
const openScannerBtn = document.getElementById('openScannerBtn');
if (openScannerBtn) openScannerBtn.addEventListener('click', openScanner);
const closeScannerBtn = document.getElementById('closeScannerBtn');
if (closeScannerBtn) closeScannerBtn.addEventListener('click', closeScanner);
const switchCameraBtn = document.getElementById('switchCameraBtn');
if (switchCameraBtn) switchCameraBtn.addEventListener('click', switchCamera);
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
        const showOldBtn = document.getElementById('showOldNotificationsBtn');
        const hideOldBtn = document.getElementById('hideOldNotificationsBtn');
        if (showOldBtn) showOldBtn.style.display = 'none';
        if (hideOldBtn) hideOldBtn.style.display = 'none';
        return;
    }

    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    const recentCount = Math.max(unreadCount, 3);
    
    let newNotifications = [];
    let oldNotifications = [];

    if (showOld) {
        newNotifications = allNotifications;
        oldNotifications = [];
        const showOldBtn = document.getElementById('showOldNotificationsBtn');
        const hideOldBtn = document.getElementById('hideOldNotificationsBtn');
        if (showOldBtn) showOldBtn.style.display = 'none';
        if (hideOldBtn) hideOldBtn.style.display = 'block';
    } else {
        newNotifications = allNotifications.slice(0, recentCount);
        oldNotifications = allNotifications.slice(recentCount);
        const showOldBtn = document.getElementById('showOldNotificationsBtn');
        const hideOldBtn = document.getElementById('hideOldNotificationsBtn');
        if (oldNotifications.length > 0) {
            if (showOldBtn) showOldBtn.style.display = 'inline-flex';
            if (hideOldBtn) hideOldBtn.style.display = 'none';
        } else {
            if (showOldBtn) showOldBtn.style.display = 'none';
            if (hideOldBtn) hideOldBtn.style.display = 'none';
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
        loadAdminStudents();
    } else {
        alert('Socket غير متصل');
    }
}

// ==========================================
// 14. دوال المدير (والمدير العام)
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

        const editId = document.getElementById('editStudentId');
        const editName = document.getElementById('editName');
        const editParentName = document.getElementById('editParentName');
        const editParentPhone = document.getElementById('editParentPhone');
        const editParentEmail = document.getElementById('editParentEmail');
        const editAddress = document.getElementById('editAddress');
        const modal = document.getElementById('editStudentModal');
        if (editId) editId.value = student._id;
        if (editName) editName.value = student.name || '';
        if (editParentName) editParentName.value = student.parentName || '';
        if (editParentPhone) editParentPhone.value = student.parentPhone || '';
        if (editParentEmail) editParentEmail.value = student.parentEmail || '';
        if (editAddress) editAddress.value = student.address || '';
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        alert('خطأ في جلب بيانات الطالب: ' + err.message);
    }
};

const saveEditStudentBtn = document.getElementById('saveEditStudentBtn');
if (saveEditStudentBtn) {
    saveEditStudentBtn.addEventListener('click', async function() {
        const id = document.getElementById('editStudentId')?.value;
        const name = document.getElementById('editName')?.value.trim();
        const parentName = document.getElementById('editParentName')?.value.trim();
        const parentPhone = document.getElementById('editParentPhone')?.value.trim();
        const parentEmail = document.getElementById('editParentEmail')?.value.trim();
        const address = document.getElementById('editAddress')?.value.trim();

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
}

const closeEditStudentBtn = document.getElementById('closeEditStudentBtn');
if (closeEditStudentBtn) {
    closeEditStudentBtn.addEventListener('click', function() {
        const modal = document.getElementById('editStudentModal');
        if (modal) modal.style.display = 'none';
    });
}

const editStudentModal = document.getElementById('editStudentModal');
if (editStudentModal) {
    editStudentModal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
}

// ==========================================
// 16. عرض جميع سجلات النشاطات في نافذة منبثقة
// ==========================================
const adminShowAllLogsBtn = document.getElementById('adminShowAllLogsBtn');
if (adminShowAllLogsBtn) {
    adminShowAllLogsBtn.addEventListener('click', function() {
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
}

const closeAllLogsBtn = document.getElementById('closeAllLogsBtn');
if (closeAllLogsBtn) {
    closeAllLogsBtn.addEventListener('click', function() {
        const modal = document.getElementById('allLogsModal');
        if (modal) modal.style.display = 'none';
    });
}

const allLogsModal = document.getElementById('allLogsModal');
if (allLogsModal) {
    allLogsModal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
}

// ==========================================
// 17. دوال المدير (إضافة طالب، إشعارات، إلخ)
// ==========================================
async function adminAddStudent() {
    const name = document.getElementById('adminStudentName')?.value.trim();
    const parentEmail = document.getElementById('adminParentEmail')?.value.trim();
    const parentName = document.getElementById('adminParentName')?.value.trim();
    const parentPhone = document.getElementById('adminParentPhone')?.value.trim();
    const address = document.getElementById('adminAddress')?.value.trim();
    if (!name || !parentEmail || !parentName || !parentPhone) {
        alert('جميع الحقول مطلوبة ما عدا العنوان');
        return;
    }

    const confirmed = await showConfirmModal('إضافة طالب جديد', `تأكيد إضافة الطالب "${name}" لولي الأمر "${parentName}"؟`);
    if (!confirmed) return;

    try {
        const res = await fetchWithAuth('/api/students', {
            method: 'POST',
            body: JSON.stringify({ name, parentEmail, parentName, parentPhone, address })
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'فشل الإضافة');
        }
        const studentNameInput = document.getElementById('adminStudentName');
        const parentEmailInput = document.getElementById('adminParentEmail');
        const parentNameInput = document.getElementById('adminParentName');
        const parentPhoneInput = document.getElementById('adminParentPhone');
        const addressInput = document.getElementById('adminAddress');
        if (studentNameInput) studentNameInput.value = '';
        if (parentEmailInput) parentEmailInput.value = '';
        if (parentNameInput) parentNameInput.value = '';
        if (parentPhoneInput) parentPhoneInput.value = '';
        if (addressInput) addressInput.value = '';
        loadAdminStudents();
        addLog('➕ تم إضافة الطالب ' + name, new Date(), 'adminLogContainer');
        const form = document.getElementById('addStudentForm');
        const btn = document.getElementById('toggleAddStudentBtn');
        if (form) form.style.display = 'none';
        if (btn) btn.textContent = '➕ إضافة طالب جديد';
    } catch (err) {
        alert('خطأ: ' + err.message);
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
    const msg = document.getElementById('adminNotificationMsg')?.value.trim();
    if (!msg) return alert('اكتب رسالة الإشعار');
    
    const confirmed = await showConfirmModal('إرسال إشعار عام', 'هل أنت متأكد من إرسال هذا الإشعار لجميع أولياء الأمور؟');
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification', { message: msg });
        const msgInput = document.getElementById('adminNotificationMsg');
        if (msgInput) msgInput.value = '';
        addLog('📢 تم إرسال إشعار عام', new Date(), 'adminLogContainer');
        alert('✅ تم إرسال الإشعار العام بنجاح');
    } else {
        alert('Socket غير متصل');
    }
}

async function adminSendParentNotification() {
    const email = document.getElementById('adminParentEmailInput')?.value.trim();
    const msg = document.getElementById('adminParentNotificationMsg')?.value.trim();
    if (!email || !msg) return alert('املأ جميع الحقول');
    
    const confirmed = await showConfirmModal('إرسال إشعار خاص', `هل أنت متأكد من إرسال هذا الإشعار لولي الأمر (${email})؟`);
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification-to-parent', { parentEmail: email, message: msg });
        const emailInput = document.getElementById('adminParentEmailInput');
        const msgInput = document.getElementById('adminParentNotificationMsg');
        if (emailInput) emailInput.value = '';
        if (msgInput) msgInput.value = '';
        alert('✅ تم إرسال الإشعار الخاص بنجاح');
    } else {
        alert('Socket غير متصل');
    }
}

// ==========================================
// 18. دوال السجل (مع عرض آخر 5 سجلات فقط)
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

    const showOldBtn = document.getElementById('adminShowOldLogsBtn');
    const hideOldBtn = document.getElementById('adminHideOldLogsBtn');
    const showAllBtn = document.getElementById('adminShowAllLogsBtn');
    if (showOldBtn) showOldBtn.style.display = 'none';
    if (hideOldBtn) hideOldBtn.style.display = 'none';
    if (showAllBtn) showAllBtn.style.display = 'none';

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
        if (showOldBtn) showOldBtn.style.display = 'none';
        if (hideOldBtn) hideOldBtn.style.display = 'inline-flex';
        if (showAllBtn) showAllBtn.style.display = 'none';
    } else {
        const todayOnly = todayLogs.length > 0 ? todayLogs : sortedLogs.slice(0, 5);
        logsToShow = todayOnly.slice(0, 5);
        
        if (oldLogs.length > 0 || todayLogs.length > 5) {
            if (showOldBtn) showOldBtn.style.display = 'inline-flex';
            if (hideOldBtn) hideOldBtn.style.display = 'none';
            if (sortedLogs.length > 5 && showAllBtn) showAllBtn.style.display = 'inline-flex';
        } else {
            if (showOldBtn) showOldBtn.style.display = 'none';
            if (hideOldBtn) hideOldBtn.style.display = 'none';
            if (showAllBtn) showAllBtn.style.display = 'none';
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

    const showOldBtn = document.getElementById('parentShowOldLogsBtn');
    const hideOldBtn = document.getElementById('parentHideOldLogsBtn');
    if (showOldBtn) showOldBtn.style.display = 'none';
    if (hideOldBtn) hideOldBtn.style.display = 'none';

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
        if (showOldBtn) showOldBtn.style.display = 'none';
        if (hideOldBtn) hideOldBtn.style.display = 'inline-flex';
    } else {
        logsToShow = todayLogs.slice(0, 5);
        if (oldLogs.length > 0 || todayLogs.length > 5) {
            if (showOldBtn) showOldBtn.style.display = 'inline-flex';
            if (hideOldBtn) hideOldBtn.style.display = 'none';
        } else {
            if (showOldBtn) showOldBtn.style.display = 'none';
            if (hideOldBtn) hideOldBtn.style.display = 'none';
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
// 20. دوال المدير العام (Super Admin) - إدارة المؤسسات
// ==========================================
async function loadTenants() {
    try {
        const res = await fetchWithAuth('/api/tenants');
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'فشل جلب المؤسسات');
        }
        tenants = await res.json();
        renderTenants();
    } catch (err) {
        console.error('❌ خطأ في جلب المؤسسات:', err);
        const container = document.getElementById('tenantsList');
        if (container) {
            container.innerHTML = `<div class="loading-state">❌ فشل تحميل المؤسسات: ${err.message}</div>`;
        }
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
                    <button class="btn-toggle-status" onclick="toggleTenantStatus('${t._id}')">${t.isActive ? 'تعطيل' : 'تفعيل'}</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ==========================================
// 21. دوال إدارة المؤسسات (مدير عام) - ✅ تم الإصلاح الكامل
// ==========================================

// فتح نافذة إضافة مؤسسة
const addTenantBtn = document.getElementById('addTenantBtn');
if (addTenantBtn) {
    addTenantBtn.addEventListener('click', function() {
        const modal = document.getElementById('addTenantModal');
        if (modal) modal.style.display = 'flex';
        console.log('✅ فتح نافذة إضافة مؤسسة');
    });
    console.log('✅ ربط addTenantBtn');
} else {
    console.warn('⚠️ addTenantBtn غير موجود');
}

// إغلاق نافذة إضافة مؤسسة
const closeAddTenantBtn = document.getElementById('closeAddTenantBtn');
if (closeAddTenantBtn) {
    closeAddTenantBtn.addEventListener('click', function() {
        const modal = document.getElementById('addTenantModal');
        if (modal) modal.style.display = 'none';
        console.log('✅ إغلاق نافذة إضافة مؤسسة');
    });
    console.log('✅ ربط closeAddTenantBtn');
} else {
    console.warn('⚠️ closeAddTenantBtn غير موجود');
}

// إغلاق نافذة الإضافة عند الضغط خارجها
const addTenantModal = document.getElementById('addTenantModal');
if (addTenantModal) {
    addTenantModal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
}

// ==========================================
// حفظ إضافة مؤسسة جديدة
// ==========================================
const saveNewTenantBtn = document.getElementById('saveNewTenantBtn');
if (saveNewTenantBtn) {
    saveNewTenantBtn.addEventListener('click', async function() {
        console.log('💾 محاولة إضافة مؤسسة جديدة...');
        
        const name = document.getElementById('newTenantName')?.value.trim();
        const subdomain = document.getElementById('newTenantSubdomain')?.value.trim();
        const address = document.getElementById('newTenantAddress')?.value.trim();
        const phone = document.getElementById('newTenantPhone')?.value.trim();
        const email = document.getElementById('newTenantEmail')?.value.trim();
        const adminEmail = document.getElementById('newTenantAdminEmail')?.value.trim();

        console.log('📦 البيانات:', { name, subdomain, address, phone, email, adminEmail });

        if (!name || !subdomain || !adminEmail) {
            alert('اسم المؤسسة، النطاق الفرعي، وبريد المدير مطلوبة');
            return;
        }

        const confirmed = await showConfirmModal(
            'إضافة مؤسسة جديدة',
            `هل أنت متأكد من إضافة المؤسسة "${name}" بالنطاق الفرعي "${subdomain}"؟`
        );
        if (!confirmed) {
            console.log('❌ تم إلغاء الإضافة');
            return;
        }

        try {
            const res = await fetchWithAuth('/api/tenants', {
                method: 'POST',
                body: JSON.stringify({ name, subdomain, address, phone, email, adminEmail })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'فشل إضافة المؤسسة');
            }
            
            console.log('✅ تم إضافة المؤسسة بنجاح:', data);
            alert('✅ تم إضافة المؤسسة بنجاح');
            
            const modal = document.getElementById('addTenantModal');
            if (modal) modal.style.display = 'none';
            
            // تفريغ الحقول
            ['newTenantName','newTenantSubdomain','newTenantAddress','newTenantPhone','newTenantEmail','newTenantAdminEmail'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            loadTenants();
        } catch (err) {
            console.error('❌ خطأ:', err);
            alert('❌ ' + err.message);
        }
    });
    console.log('✅ ربط saveNewTenantBtn');
} else {
    console.warn('⚠️ saveNewTenantBtn غير موجود');
}

// ==========================================
// تعديل مؤسسة - فتح النافذة
// ==========================================
window.editTenant = async function(tenantId) {
    console.log('📝 جاري فتح تعديل المؤسسة:', tenantId);
    try {
        const res = await fetchWithAuth('/api/tenants');
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'فشل جلب بيانات المؤسسات');
        }
        const allTenants = await res.json();
        const tenant = allTenants.find(t => t._id === tenantId);
        if (!tenant) {
            alert('المؤسسة غير موجودة');
            return;
        }

        console.log('✅ تم جلب بيانات المؤسسة:', tenant);

        const editId = document.getElementById('editTenantId');
        const editName = document.getElementById('editTenantName');
        const editAddr = document.getElementById('editTenantAddress');
        const editPhone = document.getElementById('editTenantPhone');
        const editEmail = document.getElementById('editTenantEmail');
        const modal = document.getElementById('editTenantModal');

        if (editId) editId.value = tenant._id;
        if (editName) editName.value = tenant.name || '';
        if (editAddr) editAddr.value = tenant.address || '';
        if (editPhone) editPhone.value = tenant.phone || '';
        if (editEmail) editEmail.value = tenant.email || '';
        if (modal) modal.style.display = 'flex';

    } catch (err) {
        console.error('❌ خطأ في فتح تعديل المؤسسة:', err);
        alert('خطأ في جلب بيانات المؤسسة: ' + err.message);
    }
};

// ==========================================
// إغلاق نافذة تعديل المؤسسة
// ==========================================
const closeEditTenantBtn = document.getElementById('closeEditTenantBtn');
if (closeEditTenantBtn) {
    closeEditTenantBtn.addEventListener('click', function() {
        const modal = document.getElementById('editTenantModal');
        if (modal) modal.style.display = 'none';
        console.log('🔴 تم إغلاق نافذة تعديل المؤسسة');
    });
    console.log('✅ ربط closeEditTenantBtn');
} else {
    console.warn('⚠️ closeEditTenantBtn غير موجود');
}

// إغلاق النافذة عند الضغط خارجها
const editTenantModal = document.getElementById('editTenantModal');
if (editTenantModal) {
    editTenantModal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
}

// ==========================================
// حفظ تعديلات المؤسسة
// ==========================================
const saveEditTenantBtn = document.getElementById('saveEditTenantBtn');
if (saveEditTenantBtn) {
    saveEditTenantBtn.addEventListener('click', async function() {
        console.log('💾 محاولة حفظ تعديلات المؤسسة...');
        
        const id = document.getElementById('editTenantId')?.value;
        const name = document.getElementById('editTenantName')?.value.trim();
        const address = document.getElementById('editTenantAddress')?.value.trim();
        const phone = document.getElementById('editTenantPhone')?.value.trim();
        const email = document.getElementById('editTenantEmail')?.value.trim();

        console.log('📦 البيانات:', { id, name, address, phone, email });

        if (!id) {
            alert('خطأ: لم يتم العثور على معرف المؤسسة');
            return;
        }

        if (!name) {
            alert('اسم المؤسسة مطلوب');
            return;
        }

        const confirmed = await showConfirmModal(
            'تعديل المؤسسة',
            `هل أنت متأكد من حفظ التعديلات للمؤسسة "${name}"؟`
        );
        if (!confirmed) {
            console.log('❌ تم إلغاء التعديل');
            return;
        }

        try {
            const res = await fetchWithAuth('/api/tenants/' + id, {
                method: 'PUT',
                body: JSON.stringify({ name, address, phone, email })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'فشل تحديث المؤسسة');
            }
            
            console.log('✅ تم تحديث المؤسسة بنجاح:', data);
            alert('✅ تم تحديث المؤسسة بنجاح');
            
            const modal = document.getElementById('editTenantModal');
            if (modal) modal.style.display = 'none';
            
            loadTenants();
        } catch (err) {
            console.error('❌ خطأ:', err);
            alert('❌ ' + err.message);
        }
    });
    console.log('✅ ربط saveEditTenantBtn');
} else {
    console.warn('⚠️ saveEditTenantBtn غير موجود');
}

// ==========================================
// تبديل حالة المؤسسة (تفعيل/تعطيل)
// ==========================================
window.toggleTenantStatus = async function(tenantId) {
    console.log('🔄 محاولة تغيير حالة المؤسسة:', tenantId);
    try {
        const res = await fetchWithAuth('/api/tenants');
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'فشل جلب بيانات المؤسسات');
        }
        const allTenants = await res.json();
        const tenant = allTenants.find(t => t._id === tenantId);
        if (!tenant) {
            alert('المؤسسة غير موجودة');
            return;
        }

        const newStatus = !tenant.isActive;
        const statusText = newStatus ? 'تفعيل' : 'تعطيل';
        const confirmed = await showConfirmModal(
            `${statusText} المؤسسة`,
            `هل أنت متأكد من ${statusText} المؤسسة "${tenant.name}"؟`
        );
        if (!confirmed) {
            console.log('❌ تم إلغاء تغيير الحالة');
            return;
        }

        const updateRes = await fetchWithAuth('/api/tenants/' + tenantId, {
            method: 'PUT',
            body: JSON.stringify({ isActive: newStatus })
        });
        const data = await updateRes.json();
        if (!updateRes.ok) {
            throw new Error(data.message || 'فشل تغيير الحالة');
        }
        
        console.log(`✅ تم ${statusText} المؤسسة بنجاح`);
        alert(`✅ تم ${statusText} المؤسسة بنجاح`);
        loadTenants();
    } catch (err) {
        console.error('❌ خطأ:', err);
        alert('❌ ' + err.message);
    }
};
