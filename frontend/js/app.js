// ==========================================
// 1. تحديد رابط الخادم (عدّل هذا برابط Render الخاص بك)
// ==========================================
const API_BASE_URL = 'https://studenttracker-zgom.onrender.com'; // ⚠️ استبدله برابط الخادم
const SOCKET_URL = API_BASE_URL;

const socket = io(SOCKET_URL);

// ==========================================
// 2. إدارة التوكن والمستخدم
// ==========================================
let token = localStorage.getItem('token');
let currentUser = null;

// ==========================================
// 3. دوال مساعدة للواجهة
// ==========================================
function getStatusText(isInside) {
    return isInside ? 'داخل 🏫' : 'خارج 🚪';
}

function getStatusClass(isInside) {
    return isInside ? 'inside' : 'outside';
}

// تنسيق الوقت الكامل (YYYY-MM-DD HH:mm:ss)
function formatFullTime(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
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
// 4. دوال المصادقة
// ==========================================
function saveAuth(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    showDashboard();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    token = null;
    currentUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'block';
    document.getElementById('dashboardScreen').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';
    // تعبئة بريد ولي الأمر تلقائياً في حقل الإضافة
    document.getElementById('parentEmailInput').value = currentUser.email;
    // بدء Socket.io
    connectSocket();
    loadAndRender();
}

// ==========================================
// 5. Socket.io مع التوكن
// ==========================================
let socket = null;

function connectSocket() {
    if (socket) socket.disconnect();
    socket = io(SOCKET_URL, {
        auth: { token: token }
    });

    socket.on('connect', function() {
        console.log('✅ متصل بالخادم عبر Socket');
    });

    socket.on('status-changed', function(data) {
        console.log('📢 تحديث لحظي:', data.message);
        loadAndRender(); // إعادة تحميل القائمة
        addLog('🔔 ' + data.message, new Date());
        showBrowserNotification('تحديث حالة التلميذ', data.message);
    });

    socket.on('disconnect', function() {
        console.warn('⚠️ انقطع الاتصال بالخادم');
    });
}

// ==========================================
// 6. دوال API (مع إضافة التوكن في الهيدر)
// ==========================================
function fetchWithAuth(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    };
    return fetch(API_BASE_URL + url, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
}

async function fetchStudents() {
    try {
        const res = await fetchWithAuth('/api/students');
        if (!res.ok) throw new Error('فشل في جلب البيانات');
        return await res.json();
    } catch (error) {
        console.error('خطأ في الجلب:', error);
        return [];
    }
}

// ==========================================
// 7. دوال العرض
// ==========================================
function renderStudents(students) {
    const container = document.getElementById('studentsContainer');
    
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="loading-state">📭 لا يوجد تلاميذ مسجلون، أضف الأول الآن!</div>';
        return;
    }

    let html = '';
    students.forEach(function(student) {
        const statusText = getStatusText(student.isInside);
        const statusClass = getStatusClass(student.isInside);
        const toggleText = student.isInside ? 'تسجيل خروج' : 'تسجيل دخول';
        const toggleClass = student.isInside ? 'exit' : 'enter';

        html += `
            <div class="student-card" data-id="${student._id}">
                <div>
                    <div class="student-name">${student.name} (${student.studentId})</div>
                    <div style="font-size:14px;color:#4a5a6e;">ولي الأمر: ${student.parentName}</div>
                    <div style="font-size:13px;color:#6a7a8e;">📞 ${student.parentPhone}</div>
                    <span class="student-time">🕒 ${formatFullTime(student.lastUpdate)}</span>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="card-actions">
                    <button class="btn-toggle ${toggleClass}" onclick="handleToggle('${student._id}')">
                        ${toggleText}
                    </button>
                    <button class="btn-delete" onclick="handleDelete('${student._id}')">🗑️</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 8. دوال التفاعل (Toggle - Delete - Add)
// ==========================================

window.handleToggle = function(id) {
    if (socket) socket.emit('toggle-status', id);
};

window.handleDelete = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا التلميذ؟')) return;
    fetchWithAuth('/api/students/' + id, { method: 'DELETE' })
        .then(function(res) {
            if (res.ok) {
                loadAndRender();
                addLog('🗑️ تم حذف تلميذ', new Date());
            }
        })
        .catch(function(error) {
            console.error('خطأ في الحذف:', error);
        });
};

function handleAddStudent() {
    const name = document.getElementById('studentNameInput').value.trim();
    const parentName = document.getElementById('parentNameInput').value.trim();
    const parentPhone = document.getElementById('parentPhoneInput').value.trim();
    const parentEmail = document.getElementById('parentEmailInput').value.trim();
    const address = document.getElementById('addressInput').value.trim();

    if (!name || !parentName || !parentPhone || !parentEmail) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }

    fetchWithAuth('/api/students', {
        method: 'POST',
        body: JSON.stringify({ name, parentName, parentPhone, parentEmail, address })
    })
    .then(function(res) {
        return res.json().then(function(data) {
            if (!res.ok) {
                alert(data.message || 'حدث خطأ');
                return;
            }
            // تفريغ الحقول
            document.getElementById('studentNameInput').value = '';
            document.getElementById('parentNameInput').value = '';
            document.getElementById('parentPhoneInput').value = '';
            document.getElementById('addressInput').value = '';
            loadAndRender();
            addLog('➕ تم إضافة التلميذ ' + name, new Date());
        });
    })
    .catch(function(error) {
        alert('فشل الاتصال بالخادم');
    });
}

// ==========================================
// 9. دوال السجل
// ==========================================
function addLog(message, date) {
    date = date || new Date();
    const container = document.getElementById('logContainer');
    const time = formatFullTime(date);
    
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = '<span>' + message + '</span><span class="log-time">' + time + '</span>';
    
    container.prepend(item);
    while (container.children.length > 8) {
        container.removeChild(container.lastChild);
    }
}

// ==========================================
// 10. تحميل البيانات
// ==========================================
function loadAndRender() {
    fetchStudents().then(function(students) {
        renderStudents(students);
    });
}

// ==========================================
// 11. ربط أحداث المصادقة
// ==========================================
function setupAuthEvents() {
    // تسجيل الدخول
    document.getElementById('loginBtn').addEventListener('click', function() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) return alert('يرجى ملء جميع الحقول');

        fetch(API_BASE_URL + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })
        .then(function(res) {
            return res.json().then(function(data) {
                if (!res.ok) {
                    alert(data.message || 'فشل تسجيل الدخول');
                    return;
                }
                saveAuth(data);
            });
        })
        .catch(function(err) { alert('خطأ في الاتصال'); });
    });

    // التسجيل
    document.getElementById('registerBtn').addEventListener('click', function() {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const phone = document.getElementById('regPhone').value.trim();

        if (!name || !email || !password || !phone) {
            return alert('الرجاء ملء جميع الحقول');
        }
        if (password.length < 6) {
            return alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        }

        fetch(API_BASE_URL + '/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, phone })
        })
        .then(function(res) {
            return res.json().then(function(data) {
                if (!res.ok) {
                    alert(data.message || 'فشل التسجيل');
                    return;
                }
                saveAuth(data);
            });
        })
        .catch(function(err) { alert('خطأ في الاتصال'); });
    });

    // التبديل بين الشاشات
    document.getElementById('showRegister').addEventListener('click', showRegister);
    document.getElementById('showLogin').addEventListener('click', showLogin);
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

// ==========================================
// 12. بدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    // طلب إذن الإشعارات
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    setupAuthEvents();

    // التحقق من وجود توكن سابق
    if (token) {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (user) {
                currentUser = user;
                showDashboard();
                return;
            }
        } catch(e) {}
    }
    showLogin();

    // ربط زر إضافة الطالب (يعمل بعد ظهور لوحة التحكم)
    document.getElementById('addBtn').addEventListener('click', handleAddStudent);
    document.getElementById('studentNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleAddStudent();
    });
});
