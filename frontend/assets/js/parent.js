// انتظار تحميل الصفحة بالكامل
document.addEventListener('DOMContentLoaded', () => {
  // ----- 1. جلب بيانات ولي الأمر من localStorage (بعد تسجيل الدخول) -----
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // التحقق من وجود توكن (مصادقة)
  if (!token) {
    window.location.href = '../index.html'; // إعادة التوجيه لتسجيل الدخول
    return;
  }

  // عرض بيانات ولي الأمر في البطاقة
  document.getElementById('parentName').textContent = user.name || 'غير معروف';
  document.getElementById('parentEmail').textContent = user.email || 'غير معروف';
  document.getElementById('parentPhone').textContent = user.phone || 'غير معروف';

  // ----- 2. جلب قائمة الأبناء من الـ API -----
  const studentsContainer = document.getElementById('studentsContainer');
  const studentSelect = document.getElementById('studentSelect');

  const loadChildren = async () => {
    try {
      const response = await fetch('/api/parent/my-children', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('فشل في جلب بيانات الأبناء');
      }

      const students = await response.json();

      // مسح رسالة التحميل
      studentsContainer.innerHTML = '';

      if (students.length === 0) {
        studentsContainer.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#888;">لا يوجد أبناء مسجلين حتى الآن</p>';
        return;
      }

      // تعبئة القائمة المنسدلة (select)
      studentSelect.innerHTML = '<option value="">-- اختر الطالب --</option>';
      
      // إنشاء بطاقات الطلاب
      students.forEach((student) => {
        // إضافة الخيار للقائمة المنسدلة
        const option = document.createElement('option');
        option.value = student._id;
        option.textContent = student.name;
        studentSelect.appendChild(option);

        // إنشاء بطاقة الطالب
const card = document.createElement('div');
card.className = 'student-card';

// ✅ استخدم الرابط المخزن، وإن لم يكن موجوداً استخدم رابط UI Avatars
const imageUrl = student.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=4A90D9&color=fff&size=128&rounded=true`;

card.innerHTML = `
  <img src="${imageUrl}" 
       alt="صورة ${student.name}" 
       onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=4A90D9&color=fff&size=128&rounded=true'" />
  <h4>${student.name}</h4>
  <p class="parent-detail">👨‍👩‍👦 ولي الأمر: <span>${student.parentName}</span></p>
  <p class="parent-detail">📧 البريد: <span>${student.parentEmail}</span></p>
  <p class="parent-detail">🆔 الرقم: <span>${student.studentId || 'غير محدد'}</span></p>
`;
        studentsContainer.appendChild(card);
      });
    } catch (error) {
      console.error('خطأ في تحميل الأبناء:', error);
      studentsContainer.innerHTML = `<p style="color:red; text-align:center;">حدث خطأ في تحميل البيانات: ${error.message}</p>`;
    }
  };

  // ----- 3. معالجة إرسال نموذج الرسالة -----
  const form = document.getElementById('messageForm');
  const formAlert = document.getElementById('formAlert');
  const sendBtn = document.getElementById('sendBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentId = document.getElementById('studentSelect').value;
    const subject = document.getElementById('subjectInput').value.trim();
    const message = document.getElementById('messageInput').value.trim();

    // التحقق من صحة الإدخال
    if (!studentId) {
      showAlert('الرجاء اختيار الطالب المعني بالرسالة.', 'error');
      return;
    }
    if (!message) {
      showAlert('الرجاء كتابة نص الرسالة.', 'error');
      return;
    }

    // تعطيل الزر لتجنب الإرسال المتكرر
    sendBtn.disabled = true;
    sendBtn.textContent = 'جاري الإرسال...';

    try {
      const response = await fetch('/api/parent/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ studentId, subject, message }),
      });

      const data = await response.json();

      if (response.ok) {
        showAlert('✅ تم إرسال رسالتك إلى المدرسة بنجاح!', 'success');
        form.reset(); // تفريغ الحقول
        document.getElementById('studentSelect').value = ''; // إعادة تعيين القائمة
      } else {
        showAlert(`❌ فشل الإرسال: ${data.msg || 'خطأ غير معروف'}`, 'error');
      }
    } catch (error) {
      console.error('خطأ في الإرسال:', error);
      showAlert('❌ حدث خطأ في الاتصال بالخادم.', 'error');
    } finally {
      // إعادة تفعيل الزر
      sendBtn.disabled = false;
      sendBtn.textContent = 'إرسال الرسالة';
    }
  });

  // دالة مساعدة لعرض التنبيهات
  function showAlert(text, type = 'success') {
    formAlert.textContent = text;
    formAlert.className = 'alert-msg'; // إعادة التعيين
    // إضافة الكلاس المناسب
    if (type === 'success') {
      formAlert.classList.add('alert-success');
    } else {
      formAlert.classList.add('alert-error');
    }
    // جعل التنبيه يختفي تلقائياً بعد 8 ثواني
    clearTimeout(window.alertTimeout);
    window.alertTimeout = setTimeout(() => {
      formAlert.className = 'alert-msg';
      formAlert.textContent = '';
    }, 8000);
  }

  // ----- تنفيذ تحميل الأبناء عند بدء الصفحة -----
  loadChildren();
});
