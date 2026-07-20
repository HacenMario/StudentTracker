// ==========================================
// 1. رابط الخادم
// ==========================================
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
let html5QrCode = null; // لماسح QR

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
    if (currentUser.role === 'admin') {
        showAdminDashboard();
    } else {
        showParentDashboard();
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    token = null;
    currentUser = null;
    if (socket) { socket.disconnect(); socket = null; }
    // إيقاف الماسح إذا كان مفتوحاً
    closeScanner();
    showLogin();
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
    return fetch(API_BASE_URL + url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...options.headers
        }
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
    if (fileInput.files && fileInput.files.length > 0) {
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
        document.getElementById('settingsForm').style.display = 'none';
        document.getElementById('toggleSettingsBtn').innerHTML = '<i class="fas fa-cog"></i> إعدادات المؤسسة';
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

function toggleSettingsForm() {
    const form = document.getElementById('settingsForm');
    const btn = document.getElementById('toggleSettingsBtn');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-times"></i> إغلاق الإعدادات';
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
        btn.innerHTML = '<i class="fas fa-cog"></i> إعدادات المؤسسة';
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
// 9. دوال QR Code (المسح والتحميل)
// ==========================================

// تحميل QR Code للطالب
window.downloadQR = function(studentId) {
    // إظهار مؤشر تحميل (اختياري)
    const btn = document.querySelector(`[onclick="downloadQR('${studentId}')"]`);
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
        btn.disabled = true;
    }

    fetchWithAuth('/api/students/' + studentId + '/qr')
        .then(res => {
            if (!res.ok) throw new Error('فشل تحميل QR');
            return res.blob();
        })
        .then(blob => {
            // التحقق من أن الـ blob هو صورة PNG
            if (!blob.type.includes('image/png')) {
                throw new Error('الملف المستلم ليس صورة PNG');
            }
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `QR_${studentId}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(err => {
            alert('فشل تحميل QR: ' + err.message);
            console.error(err);
        })
        .finally(() => {
            // إعادة الزر إلى حالته الأصلية
            if (btn) {
                btn.innerHTML = '<i class="fas fa-qrcode"></i> QR';
                btn.disabled = false;
            }
        });
};
// فتح الماسح الضوئي
function openScanner() {
    const modal = document.getElementById('scannerModal');
    modal.style.display = 'flex';
    const readerContainer = document.getElementById('qr-reader');
    const resultsContainer = document.getElementById('qr-reader-results');
    resultsContainer.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
        resultsContainer.innerHTML = '❌ مكتبة المسح غير محملة، تحقق من اتصال الإنترنت.';
        return;
    }

    if (html5QrCode) {
        html5QrCode.clear();
        html5QrCode = null;
    }

    html5QrCode = new Html5Qrcode('qr-reader');

    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length > 0) {
            let cameraId = devices[0].id;
            // محاولة اختيار الكاميرا الخلفية إذا كانت موجودة
            const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
            if (backCamera) cameraId = backCamera.id;

            html5QrCode.start(
                cameraId,
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                onScanSuccess,
                onScanError
            );
        } else {
            resultsContainer.innerHTML = '❌ لا توجد كاميرا متاحة.';
        }
    }).catch(err => {
        resultsContainer.innerHTML = '❌ فشل الوصول للكاميرا: ' + err.message;
    });
}

function onScanSuccess(decodedText, decodedResult) {
    const resultsContainer = document.getElementById('qr-reader-results');
    resultsContainer.innerHTML = '✅ جاري معالجة الكود...';

    fetchWithAuth('/api/students/scan-qr', {
        method: 'POST',
        body: JSON.stringify({ qrData: decodedText })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            resultsContainer.innerHTML = '✅ ' + data.message;
            // تحديث القائمة
            if (currentUser.role === 'admin') {
                loadAdminStudents();
                loadAdminLogs();
            } else {
                loadParentStudents();
                loadParentLogs();
            }
            // إغلاق الماسح بعد نجاح المسح
            setTimeout(closeScanner, 2000);
        } else {
            resultsContainer.innerHTML = '❌ ' + data.message;
        }
    })
    .catch(err => {
        resultsContainer.innerHTML = '❌ خطأ في الاتصال بالخادم';
        console.error(err);
    });
}

function onScanError(error) {
    // نتجاهل الأخطاء العادية (تظهر أثناء المسح المستمر)
    // console.warn(error);
}

function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        }).catch(err => console.warn('خطأ في إيقاف الماسح:', err));
        html5QrCode = null;
    }
    document.getElementById('scannerModal').style.display = 'none';
    document.getElementById('qr-reader-results').innerHTML = '';
}

// ربط أحداث الماسح
document.getElementById('openScannerBtn').addEventListener('click', openScanner);
document.getElementById('closeScannerBtn').addEventListener('click', closeScanner);

// ==========================================
// 10. دوال التغيير الجماعي
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
// 11. دوال الإشعارات
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
// 12. دوال المدير
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
    ` : `
        <span style="font-size:13px;color:#7b8b9e;">آخر دخول/خروج: ${formatFullTime(s.lastUpdate)}</span>
    `}
    <!-- زر QR يظهر للجميع (مدير أو ولي أمر) -->
    <button class="btn-qr" onclick="downloadQR('${s._id}')" style="background:#8e44ad; color:white; border:none; padding:6px 12px; border-radius:40px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fas fa-qrcode"></i> QR
    </button>
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

async function adminAddStudent() {
    const name = document.getElementById('adminStudentName').value.trim();
    const parentEmail = document.getElementById('adminParentEmail').value.trim();
    const parentName = document.getElementById('adminParentName').value.trim();
    const parentPhone = document.getElementById('adminParentPhone').value.trim();
    const address = document.getElementById('adminAddress').value.trim();
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
        document.getElementById('adminStudentName').value = '';
        document.getElementById('adminParentEmail').value = '';
        document.getElementById('adminParentName').value = '';
        document.getElementById('adminParentPhone').value = '';
        document.getElementById('adminAddress').value = '';
        loadAdminStudents();
        addLog('➕ تم إضافة الطالب ' + name, new Date(), 'adminLogContainer');
        document.getElementById('addStudentForm').style.display = 'none';
        document.getElementById('toggleAddStudentBtn').textContent = '➕ إضافة طالب جديد';
    } else {
        const data = await res.json();
        alert(data.message || 'حدث خطأ');
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
    if (!msg) return alert('اكتب رسالة الإشعار');
    
    const confirmed = await showConfirmModal('إرسال إشعار عام', 'هل أنت متأكد من إرسال هذا الإشعار لجميع أولياء الأمور؟');
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification', { message: msg });
        document.getElementById('adminNotificationMsg').value = '';
        addLog('📢 تم إرسال إشعار عام', new Date(), 'adminLogContainer');
    } else {
        alert('Socket غير متصل');
    }
}

async function adminSendParentNotification() {
    const email = document.getElementById('adminParentEmailInput').value.trim();
    const msg = document.getElementById('adminParentNotificationMsg').value.trim();
    if (!email || !msg) return alert('املأ جميع الحقول');
    
    const confirmed = await showConfirmModal('إرسال إشعار خاص', `هل أنت متأكد من إرسال هذا الإشعار لولي الأمر (${email})؟`);
    if (!confirmed) return;

    if (socket) {
        socket.emit('admin-notification-to-parent', { parentEmail: email, message: msg });
        document.getElementById('adminParentEmailInput').value = '';
        document.getElementById('adminParentNotificationMsg').value = '';
    } else {
        alert('Socket غير متصل');
    }
}

// ==========================================
// 13. دوال السجل
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

    document.getElementById('adminShowOldLogsBtn').style.display = 'none';
    document.getElementById('adminHideOldLogsBtn').style.display = 'none';

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
    } else {
        logsToShow = todayLogs;
        if (oldLogs.length > 0) {
            document.getElementById('adminShowOldLogsBtn').style.display = 'inline-flex';
            document.getElementById('adminHideOldLogsBtn').style.display = 'none';
        } else {
            document.getElementById('adminShowOldLogsBtn').style.display = 'none';
            document.getElementById('adminHideOldLogsBtn').style.display = 'none';
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
// 14. دوال ولي الأمر
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
        logsToShow = todayLogs;
        if (oldLogs.length > 0) {
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
// 15. أحداث المصادقة وربط الأحداث
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
// 16. بدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

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
