// sw.js - Service Worker للإشعارات (متوافق مع iOS)
console.log('✅ Service Worker loaded');

self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(clients.claim());
});

// ================================================
// 🔴 التعديل الأهم لـ iOS: إضافة مستمع Fetch فارغ
// نظام iOS يطلب وجود هذا المستمع ليعتبر الـ Service Worker
// "ثابتاً" ويسمح له بالعمل في الخلفية واستقبال الإشعارات.
// ================================================
self.addEventListener('fetch', (event) => {
  // يمكنك تركها فارغة، أو إضافة منطق للـ Cache إذا أردت.
  // لكن وجودها هو الشرط الأساسي لعمل الإشعارات على iOS.
  event.respondWith(fetch(event.request));
});

// ================================================
// باقي الكود الخاص بالإشعارات (كما هو لديك مع تحسينات بسيطة)
// ================================================
self.addEventListener('push', (event) => {
  // القيم الافتراضية
  let data = {
    title: 'إشعار جديد',
    body: 'لديك إشعار جديد من المدرسة',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    url: '/'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: 'فتح التطبيق' },
      { action: 'close', title: 'إغلاق' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // البحث عن نافذة مفتوحة بالفعل
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // إذا لم توجد، افتح نافذة جديدة
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
