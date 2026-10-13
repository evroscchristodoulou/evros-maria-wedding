/* Evros & Maria — test-only cross-device budget sync. The pairing key stays in local storage. */
(function(){
'use strict';
const API='https://evros-maria-wedding.evros-christodoulou1995.workers.dev/wedding/budget-sync';
const TOKEN_KEY='em-budget-sync-key-v1';
const SHADOW_KEY='em-budget-sync-shadow-v1';
const DATA_KEY='em-suppliers-v1';
const VERSION_KEY='em-budget-sync-revision-v1',TIME_KEY='em-budget-sync-time-v1';
function storeVersion(rev,time){if(rev)localStorage.setItem(VERSION_KEY,rev);if(time)localStorage.setItem(TIME_KEY,time)}
const $sync=id=>document.getElementById(id);
let token=localStorage.getItem(TOKEN_KEY)||'';
let revision=null, ready=false, writing=false, dirty=false, conflict=false, timer=null, pollBusy=false;
const label=(en,el)=>t(en,el);
function status(en,el){$sync('sync-status').textContent=label(en,el)}
function setControls(){const linked=!!token;$sync('sync-start').hidden=linked;$sync('sync-pair').hidden=linked;$sync('sync-share').hidden=!linked;$sync('sync-refresh').hidden=!linked;$sync('sync-stop').hidden=!linked;$sync('sync-badge').textContent=linked?label('Paired','Συνδεδεμένο'):label('Not connected','Χωρίς σύνδεση')}
function snapshot(){return JSON.stringify(suppliers)}
function shadow(){return localStorage.getItem(SHADOW_KEY)}
function setShadow(data){localStorage.setItem(SHADOW_KEY,JSON.stringify(data))}
function install(data){suppliers=data.map(normalise);localStorage.setItem(DATA_KEY,JSON.stringify(suppliers));setShadow(suppliers);render()}
async function request(key,method,payload){
  const response=await fetch(API,{method,headers:{'X-Wedding-Sync-Key':key,...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?JSON.stringify(payload):undefined,cache:'no-store'});
  let result;try{result=await response.json()}catch{result={}}
  if(!response.ok){const err=new Error(result.error||('Cloudflare error '+response.status));err.code=response.status;throw err}
  return result;
}
function validKey(s){return /^[0-9a-f]{64}$/.test(s)}
function keyFromInput(s){try{const u=new URL(s);s=u.hash.replace(/^#(?:sync|budget-sync)=/,'')}catch{}return s.trim().toLowerCase()}
function newKey(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
function connectState(key,rev,time){token=key;revision=rev;ready=true;dirty=false;conflict=false;localStorage.setItem(TOKEN_KEY,key);storeVersion(rev,time);setControls()}
async function connect(key,create){
  if(!validKey(key))return status('Invalid pairing code.','Μη έγκυρος κωδικός σύνδεσης.');
  ready=false;status('Connecting to Cloudflare…','Σύνδεση στο Cloudflare…');
  try{
    const cloud=await request(key,'GET');
    if(create){
      if(cloud.exists)throw Error('Pairing code already exists.');
      const data=JSON.parse(snapshot());
      const written=await request(key,'POST',{data,revision:null});
      setShadow(data);connectState(key,written.revision,written.updatedAt);
      status('Synced! Copy the pairing link to your other device.','Συγχρονίστηκε! Αντιγράψτε τον σύνδεσμο στην άλλη συσκευή.');
      return;
    }
    if(!cloud.exists){status('No cloud budget found for that code. Start sync on your first device and try again.','Δεν βρέθηκαν έξοδα cloud. Ξεκινήστε τον συγχρονισμό στην πρώτη συσκευή.');return}
    if(!Array.isArray(cloud.data))throw Error('Invalid cloud data');
    if(snapshot()!==JSON.stringify(cloud.data)&&suppliers.length){
      if(!confirm(label('This device already has different budget entries. Download a backup first if you want to keep them. Replace them with the paired cloud budget?','Αυτή η συσκευή έχει διαφορετικά έξοδα. Κατεβάστε αντίγραφο αν θέλετε να τα κρατήσετε. Αντικατάσταση με τα έξοδα cloud;'))){
        status('Pairing cancelled; local data kept.','Ακύρωση σύνδεσης· τα τοπικά στοιχεία διατηρήθηκαν.');return
      }
    }
    install(cloud.data);connectState(key,cloud.revision,cloud.updatedAt);
    status('Connected — changes sync automatically.','Συνδέθηκε — οι αλλαγές συγχρονίζονται αυτόματα.');
  }catch(e){ready=false;status('Could not connect: '+e.message,'Αποτυχία σύνδεσης: '+e.message)}
}
function onChange(){
  if(!ready||!token||conflict)return;
  dirty=true;status('Saving to Cloudflare…','Αποθήκευση στο Cloudflare…');
  clearTimeout(timer);timer=setTimeout(persist,650);
}
async function persist(){
  if(!ready||!token||writing||conflict||!dirty)return;
  writing=true;
  try{
    while(dirty&&ready&&!conflict){
      dirty=false;
      const data=JSON.parse(snapshot());
      const result=await request(token,'POST',{data,revision});
      revision=result.revision;setShadow(data);storeVersion(result.revision,result.updatedAt);
      status('Saved to Cloudflare ✓','Αποθηκεύτηκε στο Cloudflare ✓');
    }
  }catch(e){
    dirty=true;
    if(e.code===409){conflict=true;status('Another device updated this budget. Export a backup, then choose Refresh to review the cloud version.','Άλλη συσκευή άλλαξε τα έξοδα. Εξαγάγετε αντίγραφο και πατήστε Ανανέωση για τα στοιχεία cloud.')}
    else status('Not synced (changes kept here): '+e.message,'Δεν συγχρονίστηκε (τα στοιχεία κρατήθηκαν εδώ): '+e.message);
  }finally{writing=false}
}
async function refresh(manual){
  if(!ready||!token||pollBusy||writing)return;
  pollBusy=true;
  try{
    const cloud=await request(token,'GET');
    if(!cloud.exists||!Array.isArray(cloud.data))throw Error('Cloud budget unavailable');
    if(cloud.updatedAt&&localStorage.getItem(TIME_KEY)&&cloud.updatedAt<localStorage.getItem(TIME_KEY))return;
    if(cloud.revision!==revision){
      const hasUnsynced=dirty||snapshot()!==shadow();
      if(hasUnsynced){
        conflict=true;
        if(manual&&confirm(label('This device has changes that have not been uploaded. Replace them with the cloud budget?','Υπάρχουν μη αποθηκευμένες αλλαγές. Αντικατάσταση με τα έξοδα cloud;'))){
          install(cloud.data);revision=cloud.revision;storeVersion(cloud.revision,cloud.updatedAt);dirty=false;conflict=false;status('Downloaded latest cloud budget.','Λήφθηκαν τα τελευταία έξοδα cloud.');
        }else status('Cloud version changed; your local changes were kept. Export a backup, then Refresh to resolve.','Το cloud άλλαξε· οι τοπικές αλλαγές διατηρήθηκαν. Κρατήστε αντίγραφο και πατήστε Ανανέωση.');
      }else{
        install(cloud.data);revision=cloud.revision;storeVersion(cloud.revision,cloud.updatedAt);conflict=false;
        status('Updated from another device ✓','Ενημερώθηκε από άλλη συσκευή ✓');
      }
    }else if(manual)status('Already up to date ✓','Όλα ενημερωμένα ✓');
  }catch(e){if(manual)status('Refresh failed: '+e.message,'Αποτυχία ανανέωσης: '+e.message)}
  finally{pollBusy=false}
}
async function resume(){
  if(!token||!validKey(token)){token='';setControls();return}
  setControls();
  ready=false;
  status('Loading cloud budget…','Φόρτωση εξόδων cloud…');
  try{
    const cloud=await request(token,'GET');
    if(!cloud.exists||!Array.isArray(cloud.data))throw Error('Paired budget not found');
    const cached=shadow(),local=snapshot(),remote=JSON.stringify(cloud.data);
    if(cloud.updatedAt&&localStorage.getItem(TIME_KEY)&&cloud.updatedAt<localStorage.getItem(TIME_KEY)){ready=true;revision=localStorage.getItem(VERSION_KEY);status('Waiting for latest Cloudflare update…','Αναμονή για την τελευταία ενημέρωση Cloudflare…');return}
    revision=cloud.revision;storeVersion(cloud.revision,cloud.updatedAt);ready=true;
    if(local!==remote){
      if(cached!==null&&local!==cached){
        if(cached===remote){dirty=true;await persist();return}
        conflict=true;status('Local and cloud entries both changed. Export your local backup, then Refresh to choose the cloud version.','Τα τοπικά και cloud έξοδα έχουν αλλάξει. Κρατήστε αντίγραφο και πατήστε Ανανέωση.');
        return;
      }
      if(cached===null&&suppliers.length&&local!==remote){
        ready=false;
        if(!confirm(label('This device contains expenses not yet paired. Download a backup before replacing them with the cloud version. Replace local expenses now?','Αυτή η συσκευή έχει έξοδα που δεν συγχρονίστηκαν. Κρατήστε αντίγραφο πριν την αντικατάσταση. Να αντικατασταθούν;'))){
          status('Local budget preserved. Disconnect or export a backup before continuing.','Τα τοπικά έξοδα διατηρήθηκαν. Αποσυνδεθείτε ή κρατήστε αντίγραφο.');return
        }
        ready=true;
      }
      install(cloud.data)
    }else setShadow(suppliers);
    status('Cloud sync active ✓','Ο συγχρονισμός cloud είναι ενεργός ✓');
  }catch(e){ready=false;status('Cloud offline; your local budget is still here. Retry by reopening the page.','Το cloud δεν είναι διαθέσιμο· τα τοπικά έξοδα παραμένουν. Δοκιμάστε ξανά.')}
}
$sync('sync-start').onclick=()=>connect(newKey(),true);
$sync('sync-pair').onclick=()=>{const entered=prompt(label('Paste the pairing link or code from your other device:','Επικολλήστε τον σύνδεσμο ή κωδικό από την άλλη συσκευή:'));if(entered!==null)connect(keyFromInput(entered),false)};
$sync('sync-share').onclick=async()=>{
  const url=new URL('./suppliers.html',location.href);url.hash='sync='+token;
  try{await navigator.clipboard.writeText(url.href);status('Pairing link copied. Open it on your other device.','Ο σύνδεσμος αντιγράφηκε. Ανοίξτε τον στην άλλη συσκευή.')}
  catch{prompt(label('Copy the link to open on your other device:','Αντιγράψτε τον σύνδεσμο για την άλλη συσκευή:'),url.href)}
};
$sync('sync-refresh').onclick=()=>refresh(true);
$sync('sync-stop').onclick=()=>{
  if(!confirm(label('Stop cloud syncing on this device? Local entries will remain.','Διακοπή συγχρονισμού σε αυτή τη συσκευή; Τα τοπικά έξοδα διατηρούνται.')))return;
  clearTimeout(timer);token='';ready=false;dirty=false;conflict=false;revision=null;
  localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SHADOW_KEY);localStorage.removeItem(VERSION_KEY);localStorage.removeItem(TIME_KEY);setControls();
  status('Disconnected; local budget retained.','Αποσυνδέθηκε· τα τοπικά έξοδα διατηρήθηκαν.');
};
window.addEventListener('em-budget-local-change',onChange);
window.addEventListener('online',()=>{if(dirty)persist();else refresh(false)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(dirty)persist();else refresh(false)}});
setInterval(()=>{if(document.hidden)return;if(dirty){if(!conflict)persist()}else refresh(false)},20000);
const linked=(location.hash.match(/^#sync=([a-f0-9]{64})$/i)||[])[1];
if(linked){history.replaceState(null,'',location.pathname+location.search);connect(linked.toLowerCase(),false)}
else if(token)resume();
else{setControls();status('Your data is on this device. Start sync to connect another device.','Τα στοιχεία είναι σε αυτή τη συσκευή. Ξεκινήστε τον συγχρονισμό για άλλη συσκευή.')}
})();