import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getMessaging,getToken,onMessage,isSupported} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';
const config={"apiKey":"AIzaSyDhGcG4uVRJ8JDSpHsaEapOLav3rHX9ui8","authDomain":"evros-maria-wedding.firebaseapp.com","projectId":"evros-maria-wedding","storageBucket":"evros-maria-wedding.firebasestorage.app","messagingSenderId":"82654611605","appId":"1:82654611605:web:6e13f3b2283ec77033339c","measurementId":"G-7GQCMT82V2"};
const vapidKey="BLpmgCeJp2FD1YWucmhxbC5DL7aMAHIih8Btk5ePTYFExFi58BlWcktoeDXM4XLmZdUTGQgqJNWmk2fm8Iuk9Cg";
const button=document.getElementById('enable-notifications');
const status=document.getElementById('notification-status');
const tokenPanel=document.getElementById('notification-test');
const tokenField=document.getElementById('notification-token');
const greek=()=>document.documentElement.lang==='el';
const say=(en,el)=>{status.textContent=greek()?el:en};
let messaging;
try{
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!(await isSupported())){
    button.disabled=true;say('Push notifications are not supported in this browser.','Οι ειδοποιήσεις δεν υποστηρίζονται σε αυτό το πρόγραμμα περιήγησης.');
  }else{
    const app=initializeApp(config);
    messaging=getMessaging(app);
    onMessage(messaging,payload=>{
      const title=payload.notification?.title||'Evros & Maria';
      const body=payload.notification?.body||'Wedding update';
      say(title+': '+body,title+': '+body);
    });
    if(Notification.permission==='granted')say('Notifications are allowed on this device.','Οι ειδοποιήσεις επιτρέπονται σε αυτή τη συσκευή.');
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        if(Notification.permission==='denied')throw new Error('Permission blocked in browser settings');
        const permission=await Notification.requestPermission();
        if(permission!=='granted'){say('Permission was not granted. You can change this in browser settings.','Δεν δόθηκε άδεια. Μπορείτε να την αλλάξετε από τις ρυθμίσεις του προγράμματος περιήγησης.');return}
        const sw=await navigator.serviceWorker.register('./sw.js');
        await navigator.serviceWorker.ready;
        const token=await getToken(messaging,{vapidKey,serviceWorkerRegistration:sw});
        if(!token)throw new Error('No registration token returned');
        tokenField.value=token;
        tokenPanel.hidden=false;
        say('Notifications enabled on this device. To test delivery, copy your device token below and use Firebase Console. Automatic guest broadcast is not set up yet.','Οι ειδοποιήσεις ενεργοποιήθηκαν σε αυτή τη συσκευή. Για δοκιμή, αντιγράψτε το token παρακάτω και χρησιμοποιήστε το Firebase Console. Η μαζική αποστολή δεν έχει ρυθμιστεί ακόμη.');
      }catch(e){console.error('FCM registration failed',e);say('Could not enable notifications: '+e.message,'Αδυναμία ενεργοποίησης ειδοποιήσεων: '+e.message)}
      finally{button.disabled=false}
    });
  }
}catch(e){console.error('Firebase initialization failed',e);button.disabled=true;say('Notifications are temporarily unavailable.','Οι ειδοποιήσεις δεν είναι προσωρινά διαθέσιμες.')}
document.getElementById('copy-notification-token').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(tokenField.value);say('Device token copied. Keep it private.','Το token αντιγράφηκε. Κρατήστε το ιδιωτικό.')}catch(e){tokenField.select();say('Select and copy the token.','Επιλέξτε και αντιγράψτε το token.')}});
