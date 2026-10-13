/* Read public shared TEST budget. Never replace unpaired old browser figures silently. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-shared';
const STATUS=document.getElementById('calendar-sync-status');
const DATA_KEY='em-suppliers-v1',QUEUE_KEY='em-budget-shared-queue-v1';
const LINKED_KEY='em-budget-shared-connected-v1',SHADOW_KEY='em-budget-shared-snapshot-v1';
let busy=false;
const message=(en,el)=>{STATUS.textContent=t(en,el)};
function pendingChanges(){
 try{const queue=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(queue)&&queue.length>0}catch{return true}
}
async function refresh(){
 if(busy)return;
 if(pendingChanges()){message('Waiting for test budget changes to upload. Open Budget to check sync.','Αναμονή μεταφοράς αλλαγών. Ανοίξτε τα Έξοδα για έλεγχο συγχρονισμού.');return}
 busy=true;
 try{
   const response=await fetch(API,{cache:'no-store'});
   if(!response.ok)throw Error();
   const data=(await response.json()).data;
   if(!Array.isArray(data))throw Error();
   const local=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');
   const remote=JSON.stringify(data);
   const localCanonical=JSON.stringify(local);
   const linked=localStorage.getItem(LINKED_KEY)==='1';
   const shadow=localStorage.getItem(SHADOW_KEY);
   if(local.length&&localCanonical!==remote&&!linked){
     message('Different local budget detected. Open Budget and choose which figures everyone should use.','Βρέθηκαν διαφορετικά τοπικά έξοδα. Ανοίξτε τα Έξοδα και επιλέξτε ποια ποσά θα βλέπουν όλοι.');
     return;
   }
   if(linked&&shadow!==null&&localCanonical!==shadow){
     message('This device has unsynced local figures. Open Budget to resolve before refreshing.','Υπάρχουν μη συγχρονισμένα τοπικά ποσά. Ανοίξτε τα Έξοδα πριν την ανανέωση.');
     return;
   }
   const normalized=data.map(s=>({
      id:String(s.id||''),name:String(s.name||''),category:String(s.category||'Other'),
      cost:Number(s.cost)||0,payments:Array.isArray(s.payments)?s.payments.map(p=>({id:String(p.id||''),amount:Number(p.amount)||0,date:String(p.date||''),note:String(p.note||'')})):[],
      due:String(s.due||''),remindDays:Number(s.remindDays??3),notes:String(s.notes||'')
   }));
   const next=JSON.stringify(normalized);
   if(localCanonical!==next){localStorage.setItem(DATA_KEY,next);render()}
   localStorage.setItem(SHADOW_KEY,next);
   localStorage.setItem(LINKED_KEY,'1');
   message('Showing shared test budget · all devices match ✓','Προβάλλονται τα κοινά δοκιμαστικά έξοδα · ίδια ποσά παντού ✓');
 }catch{
   message('Cloud unavailable. The calendar is showing this device’s saved figures.','Το cloud δεν είναι διαθέσιμο. Προβάλλονται τα αποθηκευμένα στοιχεία αυτής της συσκευής.');
 }finally{busy=false}
}
refresh();
setInterval(()=>{if(!document.hidden)refresh()},12000);
window.addEventListener('focus',refresh);
window.addEventListener('storage',e=>{if(e.key===DATA_KEY)render()});
})();