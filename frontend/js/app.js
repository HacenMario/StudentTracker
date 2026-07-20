// ==========================================
// 1. تحديد رابط الخادم (عدّل هذا برابط Render الخاص بك)
// ==========================================
const API_BASE_URL = 'https://studenttracker-zgom.onrender.com'; // ⚠️ استبدله برابط الخادم
const SOCKET_URL = API_BASE_URL;

// ==========================================
// 2. اتصال Socket.io
// ==========================================
const socket = io(SOCKET_URL);

// ==========================================
// 3. دوال مساعدة
// ==========================================
function getStatusText(isInside) {
    return isInside ? 'داخل 🏫' : 'خارج 🚪';
}

function getStatusClass(isInside) {
    return isInside ? 'inside' : 'outside';
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
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
// 4. جلب البيانات من API
// ==========================================
async function fetchStudents() {
    try {
        const res = await fetch(API_BASE_URL + '/api/students'); // 🔥 تجنب backticks
        if (!res.ok) throw new Error('فشل في جلب البيانات');
        return await res.json();
    } catch (error) {
        console.error('خطأ في الجلب:', error);
        return [];
    }
}

// ==========================================
// 5. عرض الطلاب
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
                    <div class="student-name">${student.name}</div>
                    <span class="student-time">🕒 ${formatTime(student.lastUpdate)}</span>
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
// 6. دوال التفاعل (Toggle - Delete - Add)
// ==========================================

window.handleToggle = function(id) {
    socket.emit('toggle-status', id);
};

window.handleDelete = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا التلميذ؟')) return;
    fetch(API_BASE_URL + '/api/students/' + id, { method: 'DELETE' })
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
    const input = document.getElementById('studentNameInput');
    const name = input.value.trim();
    if (!name) return alert('الرجاء كتابة اسم التلميذ');

    fetch(API_BASE_URL + '/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    })
    .then(function(res) {
        return res.json().then(function(data) {
            if (!res.ok) {
                alert(data.message || 'حدث خطأ');
                return;
            }
            input.value = '';
            loadAndRender();
            addLog('➕ تم إضافة التلميذ ' + name, new Date());
        });
    })
    .catch(function(error) {
        alert('فشل الاتصال بالخادم');
    });
}

// ==========================================
// 7. دوال السجل (Logs)
// ==========================================
function addLog(message, date) {
    date = date || new Date();
    const container = document.getElementById('logContainer');
    const time = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = '<span>' + message + '</span><span class="log-time">' + time + '</span>';
    
    container.prepend(item);
    
    while (container.children.length > 8) {
        container.removeChild(container.lastChild);
    }
}

// ==========================================
// 8. تحميل البيانات وتحديث الواجهة
// ==========================================
function loadAndRender() {
    fetchStudents().then(function(students) {
        renderStudents(students);
    });
}

// ==========================================
// 9. استقبال الأحداث اللحظية (Socket.io)
// ==========================================
socket.on('connect', function() {
    console.log('✅ متصل بالخادم عبر Socket');
    loadAndRender();
});

socket.on('status-changed', function(data) {
    console.log('📢 تحديث لحظي:', data.message);
    loadAndRender();
    addLog('🔔 ' + data.message, new Date());
    showBrowserNotification('تحديث حالة التلميذ', data.message);
});

socket.on('disconnect', function() {
    console.warn('⚠️ انقطع الاتصال بالخادم');
});

// ==========================================
// 10. ربط الأحداث وبدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    document.getElementById('addBtn').addEventListener('click', handleAddStudent);
    document.getElementById('studentNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleAddStudent();
    });

    loadAndRender();
});
