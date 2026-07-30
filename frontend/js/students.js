// students.js - إدارة التلاميذ

let allStudents = [];
let allParents = [];

// تحميل التلاميذ عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    loadStudents();
    loadParents();
});

// جلب التلاميذ من الخادم
async function loadStudents() {
    try {
        const response = await fetchWithAuth('/api/students');
        if (!response.ok) throw new Error('فشل جلب التلاميذ');
        
        allStudents = await response.json();
        renderStudents(allStudents);
    } catch (error) {
        console.error('Error loading students:', error);
        showToast('❌ فشل تحميل التلاميذ', 'error');
    }
}

// جلب أولياء الأمور
async function loadParents() {
    try {
        const response = await fetchWithAuth('/api/users?role=parent');
        if (!response.ok) throw new Error('فشل جلب أولياء الأمور');
        
        allParents = await response.json();
        const parentSelect = document.getElementById('studentParent');
        parentSelect.innerHTML = '<option value="">اختر ولي أمر</option>';
        allParents.forEach(parent => {
            const option = document.createElement('option');
            option.value = parent._id;
            option.textContent = parent.name;
            parentSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading parents:', error);
    }
}

// عرض التلاميذ في الشبكة
function renderStudents(students) {
    const grid = document.getElementById('studentsGrid');
    
    if (students.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-graduate"></i>
                <p>لا يوجد تلاميذ</p>
                <button onclick="openAddStudentModal()" class="btn-primary">إضافة تلميذ</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = students.map(student => `
        <div class="student-card">
            <div class="student-avatar">
                <i class="fas fa-user-circle"></i>
            </div>
            <div class="student-info">
                <h3>${student.name}</h3>
                <p><i class="fas fa-graduation-cap"></i> السنة ${student.class}</p>
                <p><i class="fas fa-user"></i> ${student.parent?.name || 'لا يوجد'}</p>
                <div class="student-actions">
                    <button onclick="editStudent('${student._id}')" class="btn-sm btn-warning">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteStudent('${student._id}')" class="btn-sm btn-danger">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button onclick="viewStudentAbsences('${student._id}')" class="btn-sm btn-info">
                        <i class="fas fa-calendar-check"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// فلترة التلاميذ
function filterStudents() {
    const search = document.getElementById('searchStudent').value.toLowerCase();
    const classFilter = document.getElementById('filterClass').value;
    
    const filtered = allStudents.filter(student => {
        const matchName = student.name.toLowerCase().includes(search);
        const matchClass = !classFilter || student.class === parseInt(classFilter);
        return matchName && matchClass;
    });
    
    renderStudents(filtered);
}

// فتح مودال الإضافة
function openAddStudentModal() {
    document.getElementById('studentModalTitle').textContent = 'إضافة تلميذ جديد';
    document.getElementById('studentForm').reset();
    document.getElementById('studentId').value = '';
    document.getElementById('studentModal').style.display = 'block';
}

// فتح مودال التعديل
async function editStudent(id) {
    try {
        const response = await fetchWithAuth(`/api/students/${id}`);
        if (!response.ok) throw new Error('فشل جلب بيانات التلميذ');
        
        const student = await response.json();
        document.getElementById('studentModalTitle').textContent = 'تعديل تلميذ';
        document.getElementById('studentId').value = student._id;
        document.getElementById('studentName').value = student.name;
        document.getElementById('studentClass').value = student.class;
        document.getElementById('studentParent').value = student.parent?._id || '';
        document.getElementById('studentModal').style.display = 'block';
    } catch (error) {
        console.error('Error editing student:', error);
        showToast('❌ فشل تحميل بيانات التلميذ', 'error');
    }
}

// إغلاق المودال
function closeStudentModal() {
    document.getElementById('studentModal').style.display = 'none';
}

// حفظ التلميذ (إضافة أو تعديل)
document.getElementById('studentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('studentId').value;
    const data = {
        name: document.getElementById('studentName').value,
        class: parseInt(document.getElementById('studentClass').value),
        parent: document.getElementById('studentParent').value || null
    };

    try {
        const url = id ? `/api/students/${id}` : '/api/students';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetchWithAuth(url, {
            method: method,
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error(id ? 'فشل التعديل' : 'فشل الإضافة');
        
        showToast(id ? '✅ تم تعديل التلميذ بنجاح' : '✅ تم إضافة التلميذ بنجاح', 'success');
        closeStudentModal();
        loadStudents(); // إعادة تحميل القائمة
    } catch (error) {
        console.error('Error saving student:', error);
        showToast('❌ فشل حفظ التلميذ', 'error');
    }
});

// حذف تلميذ
async function deleteStudent(id) {
    if (!confirm('هل أنت متأكد من حذف هذا التلميذ؟')) return;
    
    try {
        const response = await fetchWithAuth(`/api/students/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('فشل الحذف');
        
        showToast('✅ تم حذف التلميذ بنجاح', 'success');
        loadStudents();
    } catch (error) {
        console.error('Error deleting student:', error);
        showToast('❌ فشل حذف التلميذ', 'error');
    }
}

// عرض غيابات التلميذ
function viewStudentAbsences(id) {
    // يمكن توجيه المستخدم إلى صفحة الغيابات مع فلتر
    window.location.href = `/pages/absences.html?studentId=${id}`;
}

// العودة للصفحة الرئيسية
function goBack() {
    window.location.href = '/';
}

// دوال مساعدة (افتراضية - يجب أن تكون موجودة في app.js)
function showToast(message, type) {
    // يمكن استخدام نظام Toast الموجود في app.js
    if (window.showToast) {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}

function fetchWithAuth(url, options = {}) {
    // استخدام دالة fetchWithAuth الموجودة في app.js
    if (window.fetchWithAuth) {
        return window.fetchWithAuth(url, options);
    } else {
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
    }
}
