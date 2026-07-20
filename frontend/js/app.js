// ==========================================
// 1. تحديد رابط الخادم (عدّل هذا برابط Render الخاص بك)
// ==========================================
const API_BASE_URL = 'https://studenttracker-zgom.onrender.com'; // ⚠️ استبدله برابط الخادم
const SOCKET_URL = API_BASE_URL;

const socket = io(SOCKET_URL);

// ==========================================
// 2. دوال مساعدة
// ==========================================
function getStatusText(isInside) {
    return isInside ? 'داخل 🏫' : 'خارج 🚪';
}

function getStatusClass(isInside) {
    return isInside ? 'inside' : 'outside';
}

// تنسيق الوقت الكامل (YYYY-MM-DD HH:MM:SS)
function formatFullTime(dateString) {
    const d = new Date(dateString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
// 3. جلب البيانات
// ==========================================
async function fetchStudents() {
    try {
        const res = await fetch(API_BASE_URL + '/api/students');
        if (!res.ok) throw new Error('فشل الجلب');
        return await res.json();
    } catch (error) {
        console.error(error);
        return [];
    }
}

// ==========================================
// 4. عرض الطلاب مع المعلومات الكاملة
// ==========================================
function renderStudents(students) {
    const container = document.getElementById('studentsContainer');
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="loading-state">📭 لا يوجد تلاميذ مسجلون</div>';
        return;
    }

    let html = '';
    students.forEach(student => {
        const statusText = getStatusText(student.isInside);
        const statusClass = getStatusClass(student.isInside);
        const toggleText = student.isInside ? 'تسجيل خروج' : 'تسجيل دخول';
        const toggleClass = student.isInside ? 'exit' : 'enter';

        html += `
            <div class="student-card" data-id="${student._id}">
                <div class="student-id">#${student.studentId}</div>
                <div class="student-name">${student.name}</div>
                <div class="student-details">
                    <span><i class="fas fa-user"></i> ولي الأمر: ${student.parentName}</span>
                    <span><i class="fas fa-phone"></i> ${student.phone}</span>
                    <span><i class="fas fa-envelope"></i> ${student.email}</span>
                    <span><i class="fas fa-home"></i> ${student.address}</span>
                    <span><i class="fas fa-clock"></i> آخر تحديث: ${formatFullTime(student.lastUpdate)}</span>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="card-actions">
                    <button class="btn-toggle ${toggleClass}" onclick="handleToggle('${student._id}')">${toggleText}</button>
                    <button class="btn-delete" onclick="handleDelete('${student._id}')">🗑️</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 5. التفاعلات
// ==========================================
window.handleToggle = function(id) {
    socket.emit('toggle-status', id);
};

window.handleDelete = function(id) {
    if (!confirm('حذف التلميذ؟')) return;
    fetch(API_BASE_URL + '/api/students/' + id, { method: 'DELETE' })
        .then(res => {
            if (res.ok) {
                loadAndRender();
                addLog('🗑️ تم حذف تلميذ', new Date());
            }
        })
        .catch(console.error);
};

function handleAddStudent() {
    const getVal = (id) => document.getElementById(id).value.trim();
    const name = getVal('studentName');
    const parentName = getVal('parentName');
    const phone = getVal('phone');
    const address = getVal('address');
    const email = getVal('email');

    if (!name || !parentName || !phone || !address || !email) {
        alert('جميع الحقول مطلوبة (*)');
        return;
    }

    fetch(API_BASE_URL + '/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentName, phone, address, email })
    })
    .then(res => res.json().then(data => {
        if (!res.ok) {
            alert(data.message || 'حدث خطأ');
            return;
        }
        // إفراغ الحقول
        ['studentName','parentName','phone','address','email'].forEach(id => document.getElementById(id).value = '');
        loadAndRender();
        addLog('➕ تم إضافة ' + name, new Date());
    }))
    .catch(() => alert('فشل الاتصال بالخادم'));
}

// ==========================================
// 6. السجل (Logs)
// ==========================================
function addLog(message, date) {
    date = date || new Date();
    const container = document.getElementById('logContainer');
    const time = formatFullTime(date);
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<span>${message}</span><span class="log-time">${time}</span>`;
    container.prepend(item);
    while (container.children.length > 8) container.removeChild(container.lastChild);
}

// ==========================================
// 7. التحميل والتحديث
// ==========================================
function loadAndRender() {
    fetchStudents().then(renderStudents);
}

// ==========================================
// 8. أحداث Socket.io
// ==========================================
socket.on('connect', function() {
    console.log('✅ متصل بالخادم');
    loadAndRender();
});

socket.on('status-changed', function(data) {
    loadAndRender();
    addLog('🔔 ' + data.message, new Date());
    showBrowserNotification('تحديث الحالة', data.message);
});

// ==========================================
// 9. بدء التشغيل
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    if (Notification.permission === 'default') Notification.requestPermission();

    document.getElementById('addBtn').addEventListener('click', handleAddStudent);
    // السماح بالضغط على Enter في أي حقل
    document.querySelectorAll('.form-grid input').forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') handleAddStudent();
        });
    });

    loadAndRender();
});
