// ==========================================
// 1. تحديد رابط الخادم (عدّل هذا برابط Render الخاص بك)
// ==========================================
const API_BASE_URL = 'https://your-backend.onrender.com'; // ⚠️ استبدله برابط الخادم
const SOCKET_URL = API_BASE_URL;

// ==========================================
// 2. الاتصال بـ Socket.io
// ==========================================
const socket = io(SOCKET_URL);

// ==========================================
// 3. دوال مساعدة للواجهة
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
// 4. جلب البيانات من الخادم (API)
// ==========================================
async function fetchStudents() {
    try {
        const res = await fetch(${API_BASE_URL}/api/students);
        if (!res.ok) throw new Error('فشل في جلب البيانات');
        return await res.json();
    } catch (error) {
        console.error('خطأ في الجلب:', error);
        return [];
    }
}

// ==========================================
// 5. عرض الطلاب في الواجهة
// ==========================================
function renderStudents(students) {
    const container = document.getElementById('studentsContainer');
    
    if (!students || students.length === 0) {
        container.innerHTML = <div class="loading-state">📭 لا يوجد تلاميذ مسجلون، أضف الأول الآن!</div>;
        return;
    }

    let html = '';
    students.forEach(student => {
        const statusText = getStatusText(student.isInside);
        const statusClass = getStatusClass(student.isInside);
        const toggleText = student.isInside ? 'تسجيل خروج' : 'تسجيل دخول';
        const toggleClass = student.isInside ? 'exit' : 'enter';

        html += 
            <div class="student-card" data-id="">
                <div>
                    <div class="student-name"></div>
                    <span class="student-time">🕒 </span>
                </div>
                <span class="status-badge "></span>
                <div class="card-actions">
                    <button class="btn-toggle " onclick="handleToggle('')">
                        
                    </button>
                    <button class="btn-delete" onclick="handleDelete('')">🗑️</button>
                </div>
            </div>
        ;
    });
    container.innerHTML = html;
}

// ==========================================
// 6. دوال التفاعل (Toggle - Delete - Add)
// ==========================================

window.handleToggle = async (id) => {
    socket.emit('toggle-status', id);
};

window.handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا التلميذ؟')) return;
    try {
        const res = await fetch(${API_BASE_URL}/api/students/, { method: 'DELETE' });
        if (res.ok) {
            loadAndRender();
            addLog(🗑️ تم حذف تلميذ, new Date());
        }
    } catch (error) {
        console.error('خطأ في الحذف:', error);
    }
};

async function handleAddStudent() {
    const input = document.getElementById('studentNameInput');
    const name = input.value.trim();
    if (!name) return alert('الرجاء كتابة اسم التلميذ');

    try {
        const res = await fetch(${API_BASE_URL}/api/students, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.message || 'حدث خطأ');
            return;
        }
        input.value = '';
        loadAndRender();
        addLog(➕ تم إضافة التلميذ , new Date());
    } catch (error) {
        alert('فشل الاتصال بالخادم');
    }
}

// ==========================================
// 7. دوال السجل (Logs)
// ==========================================
function addLog(message, date = new Date()) {
    const container = document.getElementById('logContainer');
    const time = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = <span></span><span class="log-time"></span>;
    
    container.prepend(item);
    
    while (container.children.length > 8) {
        container.removeChild(container.lastChild);
    }
}

// ==========================================
// 8. تحميل البيانات وتحديث الواجهة
// ==========================================
async function loadAndRender() {
    const students = await fetchStudents();
    renderStudents(students);
}

// ==========================================
// 9. استقبال الأحداث اللحظية (Socket.io)
// ==========================================
socket.on('connect', () => {
    console.log('✅ متصل بالخادم عبر Socket');
    loadAndRender();
});

socket.on('status-changed', (data) => {
    console.log('📢 تحديث لحظي:', data.message);
    loadAndRender();
    addLog(🔔 , new Date());
    showBrowserNotification('تحديث حالة التلميذ', data.message);
});

socket.on('disconnect', () => {
    console.warn('⚠️ انقطع الاتصال بالخادم');
});

// ==========================================
// 10. ربط الأحداث وبدء التطبيق
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    document.getElementById('addBtn').addEventListener('click', handleAddStudent);
    document.getElementById('studentNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddStudent();
    });

    loadAndRender();
});
