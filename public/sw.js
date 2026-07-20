// Minimal service worker — exists only so the browser considers this app installable
// (Add to Home Screen / install prompt). No offline caching, no push — this app needs
// a live connection to file reports anyway.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())
self.addEventListener('fetch', () => {}) // network passthrough, no caching
