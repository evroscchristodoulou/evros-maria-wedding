/* Evros & Maria — public TEST budget, merges legacy device entries automatically. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-shared';
const QUEUE_KEY='em-budget-shared-queue-v1';
const BACKUP_KEY='em-budget-before-shared-v1';
const LINKED_KEY='em-budget-shared-connected-v1';
const SHADOW_KEY='em-budget-shared-snapshot-v1';
const $sync=id=>document.getElementById(id);
const label=(en,el)=>t(en,el);
const status=(en,el)=>{$sync('sync-status').textContent=label(en,el)};
const serial=()=>JSON.stringify(suppliers);
const canonical=data=>JSON.stringify(data.map(normalise));
const fields=['name','category','cost','due','remindDays','notes'];
let previous=serial(),ready=false,networkBusy=false,loading=false,migrating=false,retry=null,queue=[],cloudCache=null;
try{const saved=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');if(Array.isArray(saved))queue=saved.filter(x=>Array.isArray(x)&&x.length).flatMap(group=>group.flatMap(op=>op.type==='replace_all'&&Array.isArray(op.data)?op.data.map(expense=>({type:'add_expense',expense})): [op]).reduce((all,op)=>{if(!all.length||all[all.length-1].length>=25)all.push([]);all[all.length-1].push(op);return all},[]))}catch{}
function saveQueue(){localStorage.setItem(QUEUE_KEY,JSON.stringify(queue))}
function backup(){if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,serial())}
function isLinked(){return localStorage.getItem(LINKED_KEY)==='1'}
function setMode(mode){
 $sync('sync-badge').textContent=mode==='online'?label('Synced ✓','Συγχρονισμένο ✓'):mode==='offline'?label('Offline','Εκτός σύνδεσης'):mode==='migration'?label('Two versions','Δύο εκδόσεις'):label('Loading…','Φόρτωση…');
 migrating=mode==='migration';
 $sync('sync-publish').hidden=!migrating;
 $sync('sync-use-cloud').hidden=!migrating;
 $sync('sync-comparison').hidden=!migrating;
}
function totals(data){
 let cost=0,paid=0;
 for(const item of data){cost+=Number(item.cost)||0;paid+=(item.payments||[]).reduce((sum,p)=>sum+(Number(p.amount)||0),0)}
 return {cost,paid,remaining:cost-paid};
}
function euro(n){return '€'+Number(n||0).toLocaleString('en-CY',{minimumFractionDigits:2,maximumFractionDigits:2})}
function compare(cloud){
 const a=totals(suppliers),b=totals(cloud);
 $sync('sync-comparison').textContent=label(
   'THIS device: '+euro(a.cost)+' total · '+euro(a.paid)+' paid · '+euro(a.remaining)+' remaining. SHARED cloud: '+euro(b.cost)+' total · '+euro(b.paid)+' paid · '+euro(b.remaining)+' remaining.',
   'ΑΥΤΗ η συσκευή: '+euro(a.cost)+' σύνολο · '+euro(a.paid)+' πληρωμένα · '+euro(a.remaining)+' υπόλοιπο. ΚΟΙΝΟ cloud: '+euro(b.cost)+' σύνολο · '+euro(b.paid)+' πληρωμένα · '+euro(b.remaining)+' υπόλοιπο.'
 );
}
async function request(method,data){
 const response=await fetch(API,{method,cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify(data):undefined});
 let body;try{body=await response.json()}catch{body={}}
 if(!response.ok)throw Error(body.error||'Cloudflare error '+response.status);
 return body;
}
function applyCloud(data){
 if(serial()!==canonical(data)){
   backup();
   suppliers=data.map(normalise);
   localStorage.setItem(KEY,serial());
   render();
 }
 previous=serial();
 localStorage.setItem(SHADOW_KEY,previous);
 localStorage.setItem(LINKED_KEY,'1');
 ready=true;
 setMode('online');
}

function queueOperations(ops,first=false){
 if(!ops.length)return;
 const groups=[];
 let current=[];
 for(const op of ops){
  if(current.length>=25||JSON.stringify({operations:[...current,op]}).length>95000){
   if(current.length)groups.push(current);
   current=[];
  }
  current.push(op);
 }
 if(current.length)groups.push(current);
 if(first)queue=[...groups,...queue];
 else queue.push(...groups);
 saveQueue();
}
function queueLegacy(){
 backup();
 const local=JSON.parse(serial());
 if(local.length){
  queueOperations(local.map(expense=>({type:'add_expense',expense})),true);
 }
 localStorage.setItem(LINKED_KEY,'1');
 ready=true;setMode('online');
 status('Combining this device’s existing test entries with the shared cloud budget…','Συνένωση των παλαιών δοκιμαστικών εξόδων αυτής της συσκευής με τα κοινά έξοδα cloud…');
 if(queue.length)drain();else refresh(false);
}
function queueUnsentLocalChanges(){
 if(!isLinked()||queue.length)return false;
 const previousCloud=localStorage.getItem(SHADOW_KEY);
 if(previousCloud===null||serial()===previousCloud)return false;
 try{
  const ops=changes(JSON.parse(previousCloud),JSON.parse(serial()));
  if(!ops.length)return false;
  queueOperations(ops);
  ready=true;drain();
  return true;
 }catch{return false}
}
function changes(oldData,newData,mode){
 if(mode==='replace')return [{type:'replace_all',data:newData}];
 const a=new Map(oldData.map(x=>[x.id,x])),b=new Map(newData.map(x=>[x.id,x])),ops=[];
 for(const old of oldData)if(!b.has(old.id))ops.push({type:'delete_expense',id:old.id});
 for(const next of newData){
   const old=a.get(next.id);
   if(!old){ops.push({type:'add_expense',expense:next});continue}
   const delta={};
   for(const field of fields)if(old[field]!==next[field])delta[field]=next[field];
   if(Object.keys(delta).length)ops.push({type:'update_expense',id:next.id,fields:delta});
   const oldPayments=new Map((old.payments||[]).map(p=>[p.id,p]));
   const nextPayments=new Map((next.payments||[]).map(p=>[p.id,p]));
   for(const p of old.payments||[])if(!nextPayments.has(p.id))ops.push({type:'delete_payment',id:p.id});
   for(const p of next.payments||[])if(!oldPayments.has(p.id))ops.push({type:'add_payment',expenseId:next.id,payment:p});
 }
 return ops;
}
window.addEventListener('em-budget-local-change',event=>{
 let before;try{before=JSON.parse(previous)}catch{before=[]}
 const next=serial();if(next===previous)return;
 let after;try{after=JSON.parse(next)}catch{return}
 const ops=changes(before,after,event.detail?.mode);
 previous=next;
 if(!ops.length)return;
 queue.push(ops);saveQueue();
 status('Saving your change to the shared budget…','Αποθήκευση της αλλαγής στο κοινό σύστημα…');
 if(ready)drain();
});
async function drain(){
 if(networkBusy||!ready||!queue.length)return;
 networkBusy=true;
 try{
   while(ready&&queue.length){
     await request('POST',{operations:queue[0]});
     queue.shift();saveQueue();
   }
   localStorage.setItem(SHADOW_KEY,serial());
   status('Saved — totals will match across all devices ✓','Αποθηκεύτηκε — τα σύνολα θα ταιριάζουν σε όλες τις συσκευές ✓');
   setMode('online');
 }catch(e){
   setMode('offline');
   status('Not yet saved to the shared budget. Your local changes are kept: '+e.message,'Δεν αποθηκεύτηκε ακόμη στο κοινό σύστημα. Οι τοπικές αλλαγές κρατήθηκαν: '+e.message);
 }finally{
   networkBusy=false;
   if(queue.length){clearTimeout(retry);retry=setTimeout(drain,10000)}
   else if(ready)refresh(false);
 }
}
async function refresh(manual){
 if(loading||networkBusy||queue.length||migrating)return;
 loading=true;
 try{
   const cloud=await request('GET');
   if(!Array.isArray(cloud.data))throw Error('Invalid shared budget');
   if(queue.length||networkBusy)return; // A local edit arrived while GET was pending.
   if((!isLinked()||localStorage.getItem(SHADOW_KEY)===null)&&suppliers.length&&serial()!==canonical(cloud.data)){queueLegacy();return}
   if(queueUnsentLocalChanges())return;
   applyCloud(cloud.data);
   status(manual?'All devices now show the shared figures ✓':'Shared budget active · every device uses these same figures',manual?'Όλες οι συσκευές προβάλλουν τα κοινά ποσά ✓':'Τα κοινά έξοδα είναι ενεργά · όλες οι συσκευές βλέπουν τα ίδια ποσά');
 }catch(e){setMode('offline');status('Cloud unavailable; this device shows its saved figures.','Το cloud δεν είναι διαθέσιμο· εμφανίζονται τα τοπικά αποθηκευμένα ποσά.')}
 finally{loading=false}
}
async function start(){
 if(loading||networkBusy)return;
 loading=true;
 setMode('loading');
 status('Checking the shared budget…','Έλεγχος κοινών εξόδων…');
 try{
   const cloud=await request('GET');
   if(!Array.isArray(cloud.data))throw Error('Invalid shared budget');
   if(queue.length&&isLinked()){
     ready=true;setMode('online');status('Uploading queued changes…','Μεταφορά εκκρεμών αλλαγών…');
     loading=false;drain();return;
   }
   if((!isLinked()||localStorage.getItem(SHADOW_KEY)===null)&&suppliers.length&&serial()!==canonical(cloud.data)){queueLegacy();return}
   if(queue.length){
     localStorage.setItem(LINKED_KEY,'1');
     ready=true;setMode('online');loading=false;drain();return;
   }
   if(queueUnsentLocalChanges())return;
   applyCloud(cloud.data);
   status('Shared budget active · all devices use the same totals ✓','Κοινά έξοδα ενεργά · ίδια σύνολα σε όλες τις συσκευές ✓');
 }catch(e){
   ready=false;setMode('offline');
   status('Cannot reach Cloudflare. Local figures are preserved; press Refresh to retry.','Δεν υπάρχει σύνδεση στο Cloudflare. Τα τοπικά ποσά διατηρούνται· πατήστε Ανανέωση.');
 }finally{loading=false}
}
$sync('sync-refresh').onclick=()=>{if(queue.length&&ready)drain();else if(ready)refresh(true);else start()};
$sync('sync-publish').onclick=async()=>{
 if(!migrating)return;
 const local=JSON.parse(serial());
 if(!confirm(label(
   'Make THIS DEVICE the source for EVERYONE? Its '+euro(totals(local).cost)+' total will replace the shared cloud test figures. If the app has more accurate figures, open the app and choose this option there instead.',
   'Να γίνουν τα ποσά ΑΥΤΗΣ ΤΗΣ ΣΥΣΚΕΥΗΣ κοινά για ΟΛΟΥΣ; Το σύνολο '+euro(totals(local).cost)+' θα αντικαταστήσει τα κοινά δοκιμαστικά ποσά. Αν η εφαρμογή έχει τα σωστά ποσά, επιλέξτε αυτή την ενέργεια από την εφαρμογή.'
  )))return;
 backup();
 queue=[[{type:'replace_all',data:local}]];saveQueue();
 localStorage.setItem(LINKED_KEY,'1');
 localStorage.setItem(SHADOW_KEY,serial());
 ready=true;setMode('online');
 status('Publishing this device’s figures to all devices…','Δημοσίευση των ποσών αυτής της συσκευής σε όλες τις συσκευές…');
 drain();
};
$sync('sync-use-cloud').onclick=()=>{
 if(!migrating||!cloudCache)return;
 const remote=totals(cloudCache);
 if(!confirm(label(
   'Show SHARED numbers on this device ('+euro(remote.cost)+' total)? A backup of this device’s old entries will be kept in your browser.',
   'Να εμφανιστούν τα ΚΟΙΝΑ ποσά σε αυτή τη συσκευή (σύνολο '+euro(remote.cost)+'); Θα διατηρηθεί αντίγραφο των προηγούμενων τοπικών στοιχείων.'
  )))return;
 backup();queue=[];saveQueue();applyCloud(cloudCache);
 status('This device now uses the shared figures ✓','Αυτή η συσκευή χρησιμοποιεί πλέον τα κοινά ποσά ✓');
};
window.addEventListener('online',()=>{if(ready&&queue.length)drain();else if(ready)refresh(false);else start()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(ready&&queue.length)drain();else if(ready)refresh(false);else start()}});
window.addEventListener('storage',e=>{if(e.key===KEY&&!queue.length&&!networkBusy){try{suppliers=JSON.parse(e.newValue||'[]').map(normalise);previous=serial();render()}catch{}}});
setInterval(()=>{if(document.hidden)return;if(ready&&queue.length)drain();else if(ready)refresh(false);else start()},12000);
start();
})();