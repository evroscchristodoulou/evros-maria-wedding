/* Test budget calendar — read paired cloud budget, never overwrite local edits awaiting upload. */
(function(){
'use strict';
const STATUS=document.getElementById('calendar-sync-status');
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-sync';
const TOKEN_KEY='em-budget-sync-key-v1',DATA_KEY='em-suppliers-v1',SHADOW_KEY='em-budget-sync-shadow-v1',TIME_KEY='em-budget-sync-time-v1',VERSION_KEY='em-budget-sync-revision-v1';
let busy=false;
const msg=(en,el)=>{STATUS.textContent=t(en,el)};
async function loadCloud(){
 const token=localStorage.getItem(TOKEN_KEY)||'';
 if(!/^[a-f0-9]{64}$/.test(token)){msg('Showing this device’s budget. Connect devices from the Budget page to sync.','Προβάλλονται τα έξοδα αυτής της συσκευής. Συνδέστε τις συσκευές από τη σελίδα Εξόδων.');return}
 if(busy)return;busy=true;
 try{
   const r=await fetch(API,{headers:{'X-Wedding-Sync-Key':token},cache:'no-store'});
   if(!r.ok)throw Error('Cloudflare unavailable');
   const cloud=await r.json();if(!cloud.exists||!Array.isArray(cloud.data))throw Error('No paired budget');
   const localTime=localStorage.getItem(TIME_KEY);
   if(localTime&&cloud.updatedAt&&cloud.updatedAt<localTime)return;
   const local=localStorage.getItem(DATA_KEY)||'[]';
   const shadow=localStorage.getItem(SHADOW_KEY);
   if(shadow!==null&&local!==shadow){msg('Showing local data until budget changes finish syncing.','Προβάλλονται τα τοπικά στοιχεία μέχρι να συγχρονιστούν οι αλλαγές.');return}
   if(shadow===null&&local!=='[]'&&local!==JSON.stringify(cloud.data)){msg('Local data exists. Open Budget to confirm pairing before loading cloud entries.','Υπάρχουν τοπικά έξοδα. Ανοίξτε τα Έξοδα για επιβεβαίωση σύνδεσης.');return}
   const next=JSON.stringify(cloud.data);
   if(local!==next){localStorage.setItem(DATA_KEY,next);render()}
   localStorage.setItem(SHADOW_KEY,next);
   if(cloud.revision)localStorage.setItem(VERSION_KEY,cloud.revision);
   if(cloud.updatedAt)localStorage.setItem(TIME_KEY,cloud.updatedAt);
   msg('Showing synced Cloudflare budget ✓','Προβάλλονται τα συγχρονισμένα έξοδα Cloudflare ✓');
 }catch(e){msg('Cloud sync unavailable; showing the last saved budget on this device.','Το cloud δεν είναι διαθέσιμο· προβάλλονται τα τελευταία τοπικά έξοδα.')}
 finally{busy=false}
}
loadCloud();
setInterval(()=>{if(!document.hidden)loadCloud()},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadCloud()});
})();