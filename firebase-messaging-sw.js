/**
 * Firebase Messaging Service Worker
 * Required for background push notifications on Android
 * 
 * File ini harus berada di ROOT folder website agar service worker berfungsi.
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBJw8Bp4roUjaU-qniJzEiYTOGeYAFPh98",
  authDomain: "helper-3931b.firebaseapp.com",
  projectId: "helper-3931b",
  storageBucket: "helper-3931b.firebasestorage.app",
  messagingSenderId: "124156389502",
  appId: "1:124156389502:web:e5032723b476c86b5dd02f"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'VillaTask', {
    body: body || 'Ada tugas baru',
    icon: 'images/IMG_0146 (2).PNG',
    badge: 'images/IMG_0146 (2).PNG',
    tag: data.taskId || 'villa-task',
    data: data,
    requireInteraction: true,
    vibrate: [200, 100, 200]
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  const url = taskId ? '/' : '/';
  event.waitUntil(clients.openWindow(url));
});
