/* Evros & Maria — one shared TEST budget for every visitor; no pairing, no password. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-shared';
const QUEUE_KEY='em-budget-shared-queue-v1';
const BACKUP_KEY='em-budget-before-shared-v1';
const $sync=id=>document.getElementById(id);
const label=(en,el)=>t(en,el);
const message=(en,el)=>{$sync('sync-status').textContent=label(en,el)};
const serial=()=>JSON.stringify(suppliers);
let previous=serial(),ready=false,networkBusy=false,loading=false,queue=[],retry=null;
try{const v=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');if(Array.isArray(v))queue=v.filter(g=>Array.isArray(g)&&g.length)}catch{}
function saveQueue(){localStorage.setItem(QUEUE_KEY,JSON.stringify(queue))}
function localBackup(){if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,previous)}
function setUI(mode){
  $sync('sync-badge').textContent=mode==='connected'?label('Shared · Online','Κοινό · Online'):mode==='offline'?label('Offline · Local','Εκτός · Τοπικό'):label('Test budget','Δοκιμαστικό');
  $sync('sync-publish').hidden=mode!=='migration';
  $sync('sync-use-cloud').hidden=mode!=='migration';
}
async function request(method,data){
  const response=await fetch(API,{method,cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify(data):undefined});
  let body;try{body=await response.json()}catch{body={}}
  if(!response.ok)throw Error(body.error||'Cloudflare error '+response.status);
  return body;
}
function applyCloud(data){
  const remote=JSON.stringify(data);
  if(serial()!==remote){
    localBackup();
    suppliers=data.map(normalise);
    localStorage.setItem(KEY,JSON.stringify(suppliers));
    render();
  }
  previous=serial();
}
const fields=['name','category','cost','due','remindDays','notes'];
function changes(oldData,newData,mode){
  if(mode==='replace')return [{type:'replace_all',data:newData}];
  const oldMap=new Map(oldData.map(x=>[x.id,x])),newMap=new Map(newData.map(x=>[x.id,x])),ops=[];
  for(const before of oldData)if(!newMap.has(before.id))ops.push({type:'delete_expense',id:before.id});
  for(const after of newData){
    const before=oldMap.get(after.id);
    if(!before){ops.push({type:'add_expense',expense:after});continue}
    const changed={};for(const f of fields)if(after[f]!==before[f])changed[f]=after[f];
    if(Object.keys(changed).length)ops.push({type:'update_expense',id:after.id,fields:changed});
    const oldPayments=new Map((before.payments||[]).map(p=>[p.id,p]));
    const newPayments=new Map((after.payments||[]).map(p=>[p.id,p]));
    for(const p of before.payments||[])if(!newPayments.has(p.id))ops.push({type:'delete_payment',id:p.id});
    for(const p of after.payments||[])if(!oldPayments.has(p.id))ops.push({type:'add_payment',expenseId:after.id,payment:p});
  }
  return ops;
}
window.addEventListener('em-budget-local-change',event=>{
  let oldData;try{oldData=JSON.parse(previous)}catch{oldData=[]}
  const next=serial();
  if(next===previous)return;
  let nextData;try{nextData=JSON.parse(next)}catch{return}
  const ops=changes(oldData,nextData,event.detail?.mode);
  previous=next;
  if(!ops.length)return;
  queue.push(ops);saveQueue();
  message('Saving shared budget…','Αποθήκευση κοινών εξόδων…');
  if(ready)drain();
});
async function drain(){
  if(networkBusy||!ready||!queue.length)return;
  networkBusy=true;
  try{
    while(ready&&queue.length){
      const group=queue[0];
      await request('POST',{operations:group});
      queue.shift();saveQueue();
    }
    message('Saved for all devices ✓','Αποθηκεύτηκε για όλες τις συσκευές ✓');
  }catch(e){
    setUI('offline');
    message('Not yet synced (your changes remain here): '+e.message,'Δεν συγχρονίστηκε ακόμη (οι αλλαγές είναι εδώ): '+e.message);
  }finally{
    networkBusy=false;
    if(queue.length){clearTimeout(retry);retry=setTimeout(drain,10000)}
    else if(ready)refresh(false);
  }
}
async function refresh(manual){
  if(loading||networkBusy||queue.length)return;
  loading=true;
  try{
    const result=await request('GET');
    if(!Array.isArray(result.data))throw Error('Invalid shared budget');
    applyCloud(result.data);
    ready=true;setUI('connected');
    if(manual)message('Everything is up to date ✓','Όλα είναι ενημερωμένα ✓');
    else message('Shared budget active · all devices see these figures','Κοινά έξοδα ενεργά · όλες οι συσκευές βλέπουν τα ίδια ποσά');
  }catch(e){
    setUI('offline');
    message('Cloud unavailable; showing last saved figures.','Cloud μη διαθέσιμο· προβάλλονται τα τελευταία αποθηκευμένα ποσά.');
  }finally{loading=false}
}
async function start(){
  setUI('loading');
  message('Loading the shared budget…','Φόρτωση κοινών εξόδων…');
  try{
    const result=await request('GET');
    if(!Array.isArray(result.data))throw Error('Invalid shared budget');
    if(queue.length){
      ready=true;setUI('connected');
      message('Uploading changes saved on this device…','Μεταφορά αλλαγών αυτής της συσκευής…');
      drain();return;
    }
    if(result.data.length===0&&suppliers.length>0){
      ready=false;setUI('migration');
      message('Older test entries exist on this device. Publish them to the empty shared budget, or switch to the empty shared budget.','Υπάρχουν παλαιότερα δοκιμαστικά έξοδα στη συσκευή. Δημοσιεύστε τα στο κοινό σύστημα ή επιλέξτε τα κενά κοινά έξοδα.');
      return;
    }
    applyCloud(result.data);ready=true;setUI('connected');
    message('Shared budget active · no pairing needed ✓','Κοινά έξοδα ενεργά · χωρίς σύνδεσμο ✓');
  }catch(e){
    ready=false;setUI('offline');
    message('Cannot load shared budget. Local figures remain safe; try Refresh.','Δεν φορτώθηκαν τα κοινά έξοδα. Τα τοπικά δεδομένα διατηρούνται· πατήστε Ανανέωση.');
  }
}
$sync('sync-refresh').onclick=()=>{if(queue.length)drain();else if(!ready)start();else refresh(true)};
$sync('sync-publish').onclick=async()=>{
  if(!confirm(label('Publish all sample expenses saved on this device as the shared test budget? Every visitor will see them.','Να δημοσιευτούν όλα τα δοκιμαστικά έξοδα αυτής της συσκευής στο κοινό σύστημα; Θα τα βλέπει κάθε επισκέπτης.')))return;
  ready=true;setUI('connected');queue.push([{type:'replace_all',data:JSON.parse(serial())}]);saveQueue();drain();
};
$sync('sync-use-cloud').onclick=()=>{
  if(!confirm(label('Keep a backup of older local entries and show the shared budget instead?','Να κρατηθεί αντίγραφο των παλαιών τοπικών εξόδων και να εμφανιστεί το κοινό σύστημα;')))return;
  localBackup();suppliers=[];localStorage.setItem(KEY,'[]');previous='[]';render();ready=true;setUI('connected');message('Shared test budget ready ✓','Τα κοινά δοκιμαστικά έξοδα είναι έτοιμα ✓');
};
window.addEventListener('online',()=>{if(queue.length&&ready)drain();else if(ready)refresh(false);else start()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(queue.length&&ready)drain();else if(ready)refresh(false);else start()}});
window.addEventListener('storage',e=>{if(e.key===KEY&&!queue.length&&!networkBusy){try{suppliers=JSON.parse(e.newValue||'[]').map(normalise);previous=serial();render()}catch{}}});
setInterval(()=>{if(document.hidden)return;if(queue.length&&ready)drain();else if(ready)refresh(false);else start()},12000);
start();
})();