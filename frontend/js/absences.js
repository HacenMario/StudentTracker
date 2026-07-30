// absences.js - إدارة طلبات الغياب

let allAbsences = [];
let allStudents = [];

document.addEventListener('DOMContentLoaded', () => {
    loadStudents();
    loadAbsences();
});

// جلب التلاميذ للفلتر
async function loadStudents() {
    try {
        const response = await fetchWithAuth('/api/students');
        if (!response.ok) throw new Error('فشل جلب التلاميذ');
        
        allStudents = await response.json();
        const filterSelect = document.getElementById('filterStudent');
        allStudents.forEach(student => {
            const option = document.createElement('option');
            option.value = student._id;
            option.textContent = student.name;
            filterSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

// جلب طلبات الغياب
async function loadAbsences() {
    try {
        const status = document.getElementById('filterStatus').value;
        const studentId = document.getElementById('filterStudent').value;
        
        let url = '/api/absences';
        const params = new URLSearchParams();
        if (status !== 'all') params.append('status', status);
        if (studentId !== 'all') params.append('studentId', studentId);
        
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetchWithAuth(url);
        if (!response.ok) throw new Error('فشل جلب الطلبات');
        
        allAbsences = await response.json();
        renderAbsences(allAbsences);
        updatePendingCount(allAbsences);
    } catch (error) {
        console.error('Error loading absences:', error);
        showToast('❌ فشل تحميل طلبات الغياب', 'error');
    }
}

// عرض الطلبات في الجدول
function renderAbsences(absences) {
    const tbody = document.getElementById('absencesBody');
    
    if (absences.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fas fa-calendar-alt"></i>
                    <p>لا توجد طلبات غياب</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = absences.map(absence => {
        const statusClass = {
            pending: 'status-pending',
            approved: 'status-approved',
            rejected: 'status-rejected'
        }[absence.status] || '';
        
        const statusText = {
            pending: 'معلقة',
            approved: 'مقبولة',
            rejected: 'مرفوضة'
        }[absence.status] || absence.status;

        return `
            <tr>
                <td>${absence.student?.name || 'غير معروف'}</td>
                <td>السنة ${absence.student?.class || '?'}</td>
                <td>${new Date(absence.date).toLocaleDateString('ar-DZ')}</td>
                <td>${absence.reason || 'بدون سبب'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    ${absence.status === 'pending' ? `
                        <button onclick="approveAbsence('${absence._id}')" class="btn-sm btn-success">
                            <i class="fas fa-check"></i>
                        </button>
                        <button onclick="rejectAbsence('${absence._id}')" class="btn-sm btn-danger">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : `
                        <span class="text-muted">لا يوجد إجراء</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// تحديث عدد الطلبات المعلقة
function updatePendingCount(absences) {
    const pending = absences.filter(a => a.status === 'pending').length;
    document.getElementById('pendingCount').textContent = pending;
}

// قبول طلب الغياب
async function approveAbsence(id) {
    if (!confirm('هل أنت متأكد من قبول هذا الطلب؟')) return;
    
    try {
        const response = await fetchWithAuth(`/api/absences/${id}/approve`, {
            method: 'PUT'
        });
        
        if (!response.ok) throw new Error('فشل قبول الطلب');
        
        showToast('✅ تم قبول طلب الغياب بنجاح', 'success');
        loadAbsences();
    } catch (error) {
        console.error('Error approving absence:', error);
        showToast('❌ فشل قبول الطلب', 'error');
    }
}

// رفض طلب الغياب
async function rejectAbsence(id) {
    if (!confirm('هل أنت متأكد من رفض هذا الطلب؟')) return;
    
    try {
        const response = await fetchWithAuth(`/api/absences/${id}/reject`, {
            method: 'PUT'
        });
        
        if (!response.ok) throw new Error('فشل رفض الطلب');
        
        showToast('✅ تم رفض طلب الغياب بنجاح', 'success');
        loadAbsences();
    } catch (error) {
        console.error('Error rejecting absence:', error);
        showToast('❌ فشل رفض الطلب', 'error');
    }
}

function goBack() {
    window.location.href = '/';
}

// دوال مساعدة (مثل showToast, fetchWithAuth) سيتم استيرادها من app.js
