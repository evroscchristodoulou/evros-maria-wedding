importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({"apiKey":"AIzaSyDhGcG4uVRJ8JDSpHsaEapOLav3rHX9ui8","authDomain":"evros-maria-wedding.firebaseapp.com","projectId":"evros-maria-wedding","storageBucket":"evros-maria-wedding.firebasestorage.app","messagingSenderId":"82654611605","appId":"1:82654611605:web:6e13f3b2283ec77033339c","measurementId":"G-7GQCMT82V2"});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
  // Firebase handles notification payloads automatically; this callback is for data-only pushes.
  if(payload.notification)return;
  const title=payload.data?.title||'Evros & Maria';
  const body=payload.data?.body||'Wedding update';
  self.registration.showNotification(title,{body,icon:'./monogram.png',badge:'./monogram.png',tag:'wedding-update',data:{url:payload.data?.url||'./'}});
});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=new URL(event.notification.data?.url||'./',self.registration.scope).href;event.waitUntil(clients.openWindow(url))});
const CACHE='evros-maria-v8';const ASSETS=['./','./index.html','./manifest.webmanifest','./wedding.ics'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===self.location.origin)e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)))})