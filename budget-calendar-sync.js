/* Shared Cloudflare TEST budget — read, merge older local test records, update payment calendar. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-shared';
const DATA_KEY='em-suppliers-v1',QUEUE_KEY='em-budget-shared-queue-v1';
const LINKED_KEY='em-budget-shared-connected-v1',SHADOW_KEY='em-budget-shared-snapshot-v1';
const BACKUP_KEY='em-budget-before-shared-v1';
const status=document.getElementById('calendar-sync-status');
const text=(en,el)=>{status.textContent=t(en,el)};
let busy=false;
function normalize(x){
  const payments=Array.isArray(x.payments)?x.payments.map(p=>({
    id:String(p.id||crypto.randomUUID()),amount:Number(p.amount)||0,
    date:String(p.date||''),note:String(p.note||'').slice(0,180)
  })):Number(x.paid)>0?[{id:crypto.randomUUID(),amount:Number(x.paid),date:'',note:'Opening test balance'}]:[];
  return {id:String(x.id||crypto.randomUUID()),name:String(x.name||'').slice(0,100),
    category:String(x.category||'Other').slice(0,60),cost:Number(x.cost)||0,
    due:String(x.due||''),remindDays:Number(x.remindDays??3),notes:String(x.notes||'').slice(0,300),payments};
}
function pending(){
 try{const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(q)&&q.length>0}catch{return true}
}
async function call(method,payload){
 const response=await fetch(API,{method,cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify(payload):undefined});
 if(!response.ok)throw Error('Cloudflare returned '+response.status);
 return response.json();
}
async function mergeOld(entries){
 if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,JSON.stringify(entries));
 const ops=entries.map(expense=>({type:'add_expense',expense}));
 let batch=[];
 for(const op of ops){
   if(batch.length>=20||JSON.stringify({operations:[...batch,op]}).length>95000){
     if(batch.length)await call('POST',{operations:batch});
     batch=[];
   }
   batch.push(op);
 }
 if(batch.length)await call('POST',{operations:batch});
}
async function refresh(){
 if(busy)return;
 if(pending()){text('Local changes are waiting to sync; open Budget to finish uploading.','Τοπικές αλλαγές περιμένουν συγχρονισμό· ανοίξτε τα Έξοδα.');return}
 busy=true;
 try{
   let cloud=await call('GET');
   if(!Array.isArray(cloud.data))throw Error('Invalid cloud budget');
   const local=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');
   const linked=localStorage.getItem(LINKED_KEY)==='1';
   const shadow=localStorage.getItem(SHADOW_KEY);
   const current=JSON.stringify(local.map(normalize));
   let next=JSON.stringify(cloud.data.map(normalize));
   if(local.length&&current!==next&&(!linked||shadow===null)){
     text('Merging older sample figures with the shared budget…','Συνένωση των παλαιών δοκιμαστικών ποσών με τα κοινά έξοδα…');
     await mergeOld(local.map(normalize));
     cloud=await call('GET');
     next=JSON.stringify(cloud.data.map(normalize));
   }else if(linked&&shadow!==null&&current!==shadow&&current!==next){
     text('This device has unsent changes; open Budget to upload them.','Αυτή η συσκευή έχει αλλαγές προς αποστολή· ανοίξτε τα Έξοδα.');
     return;
   }
   if(localStorage.getItem(DATA_KEY)!==next){localStorage.setItem(DATA_KEY,next);render()}
   localStorage.setItem(SHADOW_KEY,next);
   localStorage.setItem(LINKED_KEY,'1');
   text('Showing shared test totals from Cloudflare ✓','Προβάλλονται τα κοινά δοκιμαστικά ποσά από Cloudflare ✓');
 }catch(e){text('Could not refresh Cloudflare; showing locally saved test figures.','Δεν ήταν δυνατή η ανανέωση Cloudflare· προβάλλονται τα τοπικά δοκιμαστικά ποσά.')}
 finally{busy=false}
}
refresh();
setInterval(()=>{if(!document.hidden)refresh()},12000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('storage',e=>{if(e.key===DATA_KEY)render()});
})();