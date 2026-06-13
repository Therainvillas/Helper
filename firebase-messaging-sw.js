/**
 * VillaTask Service Worker
 * Handles: Firebase push notifications + offline caching for PWA
 */

const CACHE_NAME = 'villatask-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './images/IMG_0146 (2).PNG',
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css'
];

// ======================== INSTALL ========================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Some assets failed to cache:', err);
        // Still install even if some assets fail
        return cache.addAll(['./index.html', './manifest.json']);
      });
    })
  );
  self.skipWaiting();
});

// ======================== ACTIVATE ========================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ======================== FETCH (Network-first with cache fallback) ========================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and Google Apps Script API calls
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('script.google.com')) return;
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('firebase')) return;
  if (url.hostname.includes('callmebot.com')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, serve the main page
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// ======================== FIREBASE MESSAGING ========================
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
  const url = taskId ? './' : './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if any
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
