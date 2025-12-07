// sw.js
self.addEventListener("install", (event) => {
    self.skipWaiting();
  });
  
  self.addEventListener("activate", (event) => {
    self.clients.claim();
  });
  
  // キャッシュ制御は特にしない（オンライン前提）
  