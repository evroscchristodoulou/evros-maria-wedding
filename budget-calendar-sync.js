/* Live shared TEST budget for monthly payment calendar — no pairing needed. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-shared';
const STATUS=document.getElementById('calendar-sync-status');
const DATA_KEY='em-suppliers-v1',QUEUE_KEY='em-budget-shared-queue-v1';
let busy=false;
function message(en,el){STATUS.textContent=t(en,el)}
async function refresh(){
  if(busy)return;
  // Do not clobber unsaved changes from the open budget tab on this device.
  try{const pending=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');if(Array.isArray(pending)&&pending.length){message('Waiting for locally saved changes to upload…','Αναμονή αποθήκευσης τοπικών αλλαγών…');return}}catch{}
  busy=true;
  try{
    const response=await fetch(API,{cache:'no-store'});
    if(!response.ok)throw Error();
    const data=(await response.json()).data;
    if(!Array.isArray(data))throw Error();
    const remote=JSON.stringify(data);
    if((localStorage.getItem(DATA_KEY)||'[]')!==remote){localStorage.setItem(DATA_KEY,remote);render()}
    message('Showing shared test budget · updates automatically ✓','Προβάλλονται κοινά δοκιμαστικά έξοδα · αυτόματη ενημέρωση ✓');
  }catch{
    message('Cloud budget unavailable; displaying the last saved numbers.','Κοινά έξοδα μη διαθέσιμα· εμφανίζονται τα τελευταία ποσά.');
  }finally{busy=false}
}
refresh();
setInterval(()=>{if(!document.hidden)refresh()},12000);
window.addEventListener('focus',refresh);
window.addEventListener('storage',event=>{if(event.key===DATA_KEY)render()});
})();