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
// 3. نظام الترجمات (i18n) - مختصر
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
    if (!currentTenantSubdomain) {
        currentTenantSubdomain = localStorage.getItem('tenantSubdomain') || 'demo';
    }
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
        const res = await fetch(`${API_BASE_URL}/api/settings`, {
            headers: {
                'x-tenant-subdomain': getTenantSubdomain()
            }
        });
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
// 10. دوال QR Code - مختصرة
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
    // ... (مختصر، نفس الكود السابق)
    // للحفاظ على الطول، يمكنك نسخ هذا الجزء من الكود السابق
}

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

async function subscribeToPush() { /* ... مختصر */ }
async function sendSubscriptionToServer(subscription) { /* ... مختصر */ }
function urlBase64ToUint8Array(base64String) { /* ... مختصر */ }
async function unsubscribeFromPush() { /* ... مختصر */ }

// ==========================================
// 12. دوال المدير العام (Super Admin) - إدارة المؤسسات
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
// 13. دوال المدير العام - الأزرار
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

// إضافة مؤسسة جديدة
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

        if (!name || !subdomain || !adminEmail) {
            alert('اسم المؤسسة، النطاق الفرعي، وبريد المدير مطلوبة');
            return;
        }

        const confirmed = await showConfirmModal(
            'إضافة مؤسسة جديدة',
            `هل أنت متأكد من إضافة المؤسسة "${name}" بالنطاق الفرعي "${subdomain}"؟`
        );
        if (!confirmed) return;

        try {
            const res = await fetchWithAuth('/api/tenants', {
                method: 'POST',
                body: JSON.stringify({ name, subdomain, address, phone, email, adminEmail })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل إضافة المؤسسة');
            
            alert('✅ تم إضافة المؤسسة بنجاح');
            const modal = document.getElementById('addTenantModal');
            if (modal) modal.style.display = 'none';
            
            ['newTenantName','newTenantSubdomain','newTenantAddress','newTenantPhone','newTenantEmail','newTenantAdminEmail'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            loadTenants();
        } catch (err) {
            alert('❌ ' + err.message);
        }
    });
    console.log('✅ ربط saveNewTenantBtn');
} else {
    console.warn('⚠️ saveNewTenantBtn غير موجود');
}

// ==========================================
// 14. دوال تعديل المؤسسة
// ==========================================
window.editTenant = async function(tenantId) {
    try {
        const res = await fetchWithAuth('/api/tenants');
        if (!res.ok) throw new Error('فشل جلب بيانات المؤسسات');
        const allTenants = await res.json();
        const tenant = allTenants.find(t => t._id === tenantId);
        if (!tenant) {
            alert('المؤسسة غير موجودة');
            return;
        }

        document.getElementById('editTenantId').value = tenant._id;
        document.getElementById('editTenantName').value = tenant.name || '';
        document.getElementById('editTenantAddress').value = tenant.address || '';
        document.getElementById('editTenantPhone').value = tenant.phone || '';
        document.getElementById('editTenantEmail').value = tenant.email || '';
        document.getElementById('editTenantModal').style.display = 'flex';
    } catch (err) {
        alert('خطأ في جلب بيانات المؤسسة: ' + err.message);
    }
};

// إغلاق نافذة تعديل المؤسسة
const closeEditTenantBtn = document.getElementById('closeEditTenantBtn');
if (closeEditTenantBtn) {
    closeEditTenantBtn.addEventListener('click', function() {
        document.getElementById('editTenantModal').style.display = 'none';
    });
    console.log('✅ ربط closeEditTenantBtn');
} else {
    console.warn('⚠️ closeEditTenantBtn غير موجود');
}

// حفظ تعديلات المؤسسة
const saveEditTenantBtn = document.getElementById('saveEditTenantBtn');
if (saveEditTenantBtn) {
    saveEditTenantBtn.addEventListener('click', async function() {
        const id = document.getElementById('editTenantId')?.value;
        const name = document.getElementById('editTenantName')?.value.trim();
        const address = document.getElementById('editTenantAddress')?.value.trim();
        const phone = document.getElementById('editTenantPhone')?.value.trim();
        const email = document.getElementById('editTenantEmail')?.value.trim();

        if (!id) { alert('خطأ: لم يتم العثور على معرف المؤسسة'); return; }
        if (!name) { alert('اسم المؤسسة مطلوب'); return; }

        const confirmed = await showConfirmModal('تعديل المؤسسة', `هل أنت متأكد من حفظ التعديلات للمؤسسة "${name}"؟`);
        if (!confirmed) return;

        try {
            const res = await fetchWithAuth('/api/tenants/' + id, {
                method: 'PUT',
                body: JSON.stringify({ name, address, phone, email })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل تحديث المؤسسة');
            
            alert('✅ تم تحديث المؤسسة بنجاح');
            document.getElementById('editTenantModal').style.display = 'none';
            loadTenants();
        } catch (err) {
            alert('❌ ' + err.message);
        }
    });
    console.log('✅ ربط saveEditTenantBtn');
} else {
    console.warn('⚠️ saveEditTenantBtn غير موجود');
}

// ==========================================
// 15. تبديل حالة المؤسسة
// ==========================================
window.toggleTenantStatus = async function(tenantId) {
    try {
        const res = await fetchWithAuth('/api/tenants');
        if (!res.ok) throw new Error('فشل جلب بيانات المؤسسات');
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
        if (!confirmed) return;

        const updateRes = await fetchWithAuth('/api/tenants/' + tenantId, {
            method: 'PUT',
            body: JSON.stringify({ isActive: newStatus })
        });
        const data = await updateRes.json();
        if (!updateRes.ok) throw new Error(data.message || 'فشل تغيير الحالة');
        
        alert(`✅ تم ${statusText} المؤسسة بنجاح`);
        loadTenants();
    } catch (err) {
        alert('❌ ' + err.message);
    }
};

// ==========================================
// 16. دوال المدير - الأزرار الرئيسية
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

async function loadAdminStudents() { /* ... مختصر */ }
function renderStudents(students, containerId, showAdminControls) { /* ... مختصر */ }
async function adminAddStudent() { /* ... مختصر */ }
function toggleAddStudentForm() { /* ... مختصر */ }
async function adminSendGeneralNotification() { /* ... مختصر */ }
async function adminSendParentNotification() { /* ... مختصر */ }

// ==========================================
// 17. دوال السجل (Logs)
// ==========================================
function addLog(message, date, containerId) { /* ... مختصر */ }
async function loadAdminLogs() { /* ... مختصر */ }
function renderAdminLogs(showOld) { /* ... مختصر */ }
function toggleAdminOldLogs(show) { adminShowOldLogs = show; renderAdminLogs(adminShowOldLogs); }

// ==========================================
// 18. دوال ولي الأمر
// ==========================================
async function loadParentStudents() { /* ... مختصر */ }
async function loadParentLogs() { /* ... مختصر */ }
function renderParentLogs(showOld) { /* ... مختصر */ }
function toggleParentOldLogs(show) { parentShowOldLogs = show; renderParentLogs(parentShowOldLogs); }

// ==========================================
// 19. دوال الإشعارات داخل التطبيق
// ==========================================
async function loadAdminNotifications() { /* ... مختصر */ }
async function loadParentNotifications() { /* ... مختصر */ }
function renderNotifications(showOld) { /* ... مختصر */ }
function addNotificationToUI(message, createdAt, isRead, id) { /* ... مختصر */ }
function toggleOldNotifications(show) { showOldNotifications = show; renderNotifications(showOldNotifications); }

// ==========================================
// 20. ✅ إصلاح أزرار تسجيل الدخول والتسجيل
// ==========================================
function setupAuthEvents() {
    console.log('🔧 جاري ربط أحداث المصادقة...');

    // ---------- ✅ زر تسجيل الدخول ----------
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async function() {
            console.log('🔑 محاولة تسجيل الدخول...');
            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value.trim();
            
            if (!email || !password) {
                alert('الرجاء إدخال البريد الإلكتروني وكلمة المرور');
                return;
            }

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
                if (!res.ok) {
                    throw new Error(data.message || 'فشل تسجيل الدخول');
                }
                console.log('✅ تم تسجيل الدخول بنجاح:', data.user);
                saveAuth(data);
            } catch (err) {
                console.error('❌ خطأ في تسجيل الدخول:', err);
                alert(err.message || 'فشل تسجيل الدخول');
            }
        });
        console.log('✅ ربط زر تسجيل الدخول (loginBtn)');
    } else {
        console.warn('⚠️ loginBtn غير موجود في الصفحة');
    }

    // ---------- ✅ زر التسجيل ----------
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async function() {
            console.log('📝 محاولة التسجيل...');
            const name = document.getElementById('regName')?.value.trim();
            const email = document.getElementById('regEmail')?.value.trim();
            const password = document.getElementById('regPassword')?.value.trim();
            const phone = document.getElementById('regPhone')?.value.trim();
            const role = document.getElementById('regRole')?.value || 'parent';

            if (!name || !email || !password || !phone) {
                alert('الرجاء ملء جميع الحقول');
                return;
            }
            if (password.length < 6) {
                alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
                return;
            }

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
                if (!res.ok) {
                    throw new Error(data.message || 'فشل التسجيل');
                }
                console.log('✅ تم التسجيل بنجاح:', data.user);
                saveAuth(data);
            } catch (err) {
                console.error('❌ خطأ في التسجيل:', err);
                alert(err.message || 'فشل التسجيل');
            }
        });
        console.log('✅ ربط زر التسجيل (registerBtn)');
    } else {
        console.warn('⚠️ registerBtn غير موجود في الصفحة');
    }

    // ---------- روابط التبديل بين الشاشات ----------
    const showRegisterLink = document.getElementById('showRegister');
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', function(e) {
            e.preventDefault();
            showRegister();
        });
        console.log('✅ ربط showRegister');
    }

    const showLoginLink = document.getElementById('showLogin');
    if (showLoginLink) {
        showLoginLink.addEventListener('click', function(e) {
            e.preventDefault();
            showLogin();
        });
        console.log('✅ ربط showLogin');
    }

    // ---------- أزرار تسجيل الخروج ----------
    const logoutBtnAdmin = document.getElementById('logoutBtnAdmin');
    if (logoutBtnAdmin) logoutBtnAdmin.addEventListener('click', logout);
    const logoutBtnParent = document.getElementById('logoutBtnParent');
    if (logoutBtnParent) logoutBtnParent.addEventListener('click', logout);
    const logoutBtnSuperAdmin = document.getElementById('logoutBtnSuperAdmin');
    if (logoutBtnSuperAdmin) logoutBtnSuperAdmin.addEventListener('click', logout);

    console.log('🔧 تم ربط جميع أحداث المصادقة بنجاح!');
}

// ==========================================
// 21. بدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 بدء التطبيق...');

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    loadTranslations(currentLanguage);
    
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

    loadSchoolSettings();
    setupAuthEvents();

    if (token) {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (user) {
                currentUser = user;
                if (currentUser.role === 'super_admin') {
                    showSuperAdminDashboard();
                } else if (currentUser.role === 'admin') {
                    showAdminDashboard();
                } else {
                    showParentDashboard();
                }
                return;
            }
        } catch(e) {
            console.error('خطأ في قراءة المستخدم:', e);
        }
    }
    showLogin();
});
