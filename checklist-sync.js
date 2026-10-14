/* Evros & Maria — shared TEST checklist (Cloudflare KV). No private information. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/checklist';
const LINKED='em-checklist-cloud-linked-v1',QUEUE='em-checklist-sync-queue-v1';
const status=document.getElementById('sync-status'),refreshButton=document.getElementById('sync-refresh');
let queue=[],working=false,ready=false,lastPoll=0;
try{const saved=JSON.parse(localStorage.getItem(QUEUE)||'[]');if(Array.isArray(saved))queue=saved.filter(x=>x&&['upsert','delete'].includes(x.type)&&typeof x.id==='string')}catch{}
const msg=(en,el)=>{status.textContent=t(en,el)};
const storeQueue=()=>localStorage.setItem(QUEUE,JSON.stringify(queue));
const validTask=x=>x&&typeof x.id==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(x.id)&&typeof x.name==='string'&&x.name.trim()&&x.name.length<=180;
const toOp=x=>({type:'upsert',id:x.id,name:x.name,due:x.due||'',done:!!x.done});
function enqueue(ops){
 for(const op of ops){if(!op||typeof op.id!=='string')continue;queue=queue.filter(x=>x.id!==op.id);queue.push(op)}
 storeQueue();
}
async function request(method,operations){
 const response=await fetch(API,{method,cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify({operations}):undefined});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||'HTTP '+response.status);
 return body;
}
function writeLocal(data){tasks=data;localStorage.setItem(KEY,JSON.stringify(tasks));render()}
async function drain(){
 if(working||!ready||!queue.length)return;
 working=true;
 try{
  while(queue.length){
   const batch=queue.slice(0,25);
   await request('POST',batch);
   queue.splice(0,batch.length);storeQueue();
  }
  msg('Shared checklist saved ✓','Η κοινή λίστα αποθηκεύτηκε ✓');
 }catch(e){msg('Changes saved on this device; cloud retry pending.','Οι αλλαγές αποθηκεύτηκαν στη συσκευή· εκκρεμεί συγχρονισμός.')}
 finally{working=false}
}
async function pull(){
 if(working)return;
 working=true;refreshButton.disabled=true;
 msg('Connecting to shared checklist…','Σύνδεση με την κοινή λίστα…');
 try{
  const result=await request('GET');
  if(!Array.isArray(result.entries))throw Error('Invalid response');
  const cloud=new Map(result.entries.filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
  const local=tasks.filter(validTask);
  const linked=localStorage.getItem(LINKED)==='1';
  const migration=[];
  // Initial migration keeps custom tasks from older devices; cloud wins for existing IDs.
  if(!linked){
   for(const item of local)if(!cloud.has(item.id))migration.push(toOp(item));
  }
  const merged=new Map([...cloud.values()].filter(x=>!x.deleted&&validTask(x)).map(x=>[x.id,{id:x.id,name:x.name,due:x.due||'',done:!!x.done}]));
  for(const op of [...migration,...queue]){
   if(op.type==='delete')merged.delete(op.id);
   else if(validTask(op))merged.set(op.id,{id:op.id,name:op.name,due:op.due||'',done:!!op.done});
  }
  writeLocal([...merged.values()]);
  localStorage.setItem(LINKED,'1');
  enqueue(migration);
  ready=true;lastPoll=Date.now();
  msg(queue.length?'Uploading changes to shared checklist…':'Shared checklist is up to date ✓',queue.length?'Μεταφορά αλλαγών στην κοινή λίστα…':'Η κοινή λίστα είναι ενημερωμένη ✓');
 }catch(e){
  msg('Cloud unavailable. Changes stay on this device; retry to sync.','Το cloud δεν είναι διαθέσιμο. Οι αλλαγές μένουν στη συσκευή· δοκιμάστε ξανά.');
 }finally{working=false;refreshButton.disabled=false}
 if(ready&&queue.length)drain();
}
window.addEventListener('em-checklist-local-change',event=>{
 const ops=event.detail?.operations;
 if(!Array.isArray(ops)||!ops.length)return;
 enqueue(ops);
 if(ready)drain();
 else msg('Saved locally; waiting to connect to shared checklist.','Αποθηκεύτηκε τοπικά· αναμονή σύνδεσης με την κοινή λίστα.');
});
refreshButton.onclick=async()=>{if(queue.length&&ready)await drain();await pull()};
window.addEventListener('focus',()=>{if(Date.now()-lastPoll>30000)pull()});
window.addEventListener('online',()=>{if(queue.length&&ready)drain();else pull()});
setInterval(()=>{if(queue.length&&ready)drain()},15000);
pull();
})();
