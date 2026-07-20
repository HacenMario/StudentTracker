// ==========================================
// رابط الخادم
// ==========================================
const API_BASE_URL = 'https://studenttracker-zgom.onrender.com';
const SOCKET_URL = API_BASE_URL;

// ==========================================
// إدارة التوكن والمستخدم
// ==========================================
let token = localStorage.getItem('token');
let currentUser = null;
let socket = null;

// ==========================================
// دوال مساعدة
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

function showBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://img.icons8.com/color/96/school.png' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// ==========================================
// دوال المصادقة
// ==========================================
function saveAuth(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    // تحديد اللوحة المناسبة حسب الدور
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
    loadAdminStudents();
}

function showParentDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('parentDashboard').style.display = 'block';
    connectSocket();
    loadParentStudents();
}

// ==========================================
// Socket.io
// ==========================================
function connectSocket() {
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(SOCKET_URL, { auth: { token } });

    socket.on('connect', () => console.log('✅ Socket متصل'));

    socket.on('status-changed', (data) => {
        // تحديث القوائم حسب الدور
        if (currentUser.role === 'admin') {
            loadAdminStudents();
        } else {
            loadParentStudents();
        }
        // إضافة إشعار للسجل
        if (currentUser.role === 'parent' && data.parentId === currentUser.id) {
            addLog('🔔 ' + data.message, new Date(), 'parentLogContainer');
            showBrowserNotification('تحديث حالة ابنك', data.message);
        } else if (currentUser.role === 'admin') {
            addLog('🔔 ' + data.message, new Date(), 'adminLogContainer');
        }
    });

    // استقبال الإشعارات العامة من المدير
    socket.on('notification', (data) => {
        if (currentUser.role === 'parent') {
            const list = document.getElementById('notificationList');
            const li = document.createElement('li');
            li.textContent = data.message + ' (وقت: ' + new Date().toLocaleString() + ')';
            list.prepend(li);
            showBrowserNotification('📢 إشعار من المدرسة', data.message);
        }
    });

    socket.on('disconnect', () => console.warn('⚠️ انقطع الاتصال'));
}

// ==========================================
// دوال API مع التوكن
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
// دوال المدير
// ==========================================
async function loadAdminStudents() {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error('فشل');
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
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.adminToggle = function(id) {
    fetchWithAuth('/api/students/' + id + '/toggle', { method: 'PUT' })
        .then(res => {
            if (!res.ok) throw new Error('فشل التبديل');
            return res.json();
        })
        .then(() => {
            loadAdminStudents(); // تحديث القائمة
            // إضافة سجل
            addLog('🔄 تم تبديل حالة الطالب', new Date(), 'adminLogContainer');
        })
        .catch(err => alert('حدث خطأ: ' + err.message));
};

window.adminDelete = function(id) {
    if (!confirm('تأكيد الحذف؟')) return;
    fetchWithAuth('/api/students/' + id, { method: 'DELETE' })
        .then(() => loadAdminStudents())
        .catch(err => alert('خطأ'));
};

async function adminAddStudent() {
    const name = document.getElementById('adminStudentName').value.trim();
    const parentEmail = document.getElementById('adminParentEmail').value.trim();
    const parentName = document.getElementById('adminParentName').value.trim();
    const parentPhone = document.getElementById('adminParentPhone').value.trim();
    const address = document.getElementById('adminAddress').value.trim();
    if (!name || !parentEmail || !parentName || !parentPhone) {
        return alert('جميع الحقول مطلوبة ما عدا العنوان');
    }

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
    } else {
        const data = await res.json();
        alert(data.message || 'حدث خطأ');
    }
}

function adminSendNotification() {
    const msg = document.getElementById('adminNotificationMsg').value.trim();
    if (!msg) return alert('اكتب رسالة الإشعار');
    if (socket) {
        socket.emit('admin-notification', { message: msg });
        document.getElementById('adminNotificationMsg').value = '';
        addLog('📢 تم إرسال إشعار عام', new Date(), 'adminLogContainer');
    } else {
        alert('Socket غير متصل');
    }
}

// ==========================================
// دوال ولي الأمر
// ==========================================
async function loadParentStudents() {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error('فشل');
        const students = await res.json();
        renderStudents(students, 'parentStudentsList', false);
        // جلب سجل الحضور لأول طالب (مثلاً)
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
        if (!res.ok) throw new Error('فشل');
        const records = await res.json();
        const container = document.getElementById('parentLogContainer');
        if (records.length === 0) {
            container.innerHTML = '<div class="log-item">لا توجد سجلات بعد</div>';
            return;
        }
        let html = '';
        records.forEach(r => {
            const status = r.status === 'in' ? 'دخول' : 'خروج';
            html += `<div class="log-item"><span>${status}</span><span class="log-time">${formatFullTime(r.timestamp)}</span></div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
    }
}

// ==========================================
// دوال السجل المشتركة
// ==========================================
function addLog(message, date, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const time = formatFullTime(date || new Date());
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<span>${message}</span><span class="log-time">${time}</span>`;
    container.prepend(item);
    while (container.children.length > 10) {
        container.removeChild(container.lastChild);
    }
}

// ==========================================
// أحداث المصادقة
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

    // أحداث المدير
    document.getElementById('adminAddBtn').addEventListener('click', adminAddStudent);
    document.getElementById('adminSendNotificationBtn').addEventListener('click', adminSendNotification);
}

// ==========================================
// بدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

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
