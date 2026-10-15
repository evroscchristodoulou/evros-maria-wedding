/* Single-screen wedding guest operations. Uses existing version-checked guest plan API. */
(()=>{
'use strict';
const root=document.getElementById('quick-invite-desk');
if(!root)return;
const E=id=>document.getElementById(id);
const T=(en,gr)=>localStorage.getItem('wedding-lang')==='el'?gr:en;
const norm=s=>String(s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/\s+/g,' ');
const reply=g=>g.rsvp==='yes'?'yes':g.rsvp==='no'?'no':'pending';
const count=g=>g.rsvp==='yes'&&Number.isInteger(g.adults)&&Number.isInteger(g.children)&&g.adults+g.children>0?g.adults+g.children:Math.max(1,Number(g.partySize)||1);
const loaded=()=>plan&&Array.isArray(plan.guests)&&Array.isArray(plan.tables)&&typeof plan.revision==='string';
let saving=false,page=1,active=null;
const node=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
const button=(en,gr,fn,cls)=>{const b=node('button',cls||'',T(en,gr));b.type='button';b.onclick=fn;return b;};
const field=(en,gr,input,cls)=>{const l=node('label',cls||'');l.append(node('span','',T(en,gr)),input);return l;};
const textInput=(value,max)=>{const i=document.createElement('input');i.type='text';i.value=value;i.maxLength=max;return i;};
const numInput=(val,max,label)=>{const i=document.createElement('input');i.type='number';i.min='0';i.max=String(max);i.step='1';i.inputMode='numeric';i.placeholder='0';i.value=val===null?'':String(val);i.setAttribute('aria-label',label);return i;};
function message(text,error=false){const el=E('quick-invite-status');el.textContent=text;el.style.color=error?'#9a4f43':'#645443';}
function keepCopy(p){
 try{const key='em-wedding-guestplan-recovery-v1';const previous=JSON.parse(localStorage.getItem(key)||'null');
 if(p?.guests?.length>(previous?.guests?.length||0))localStorage.setItem(key,JSON.stringify(p));}catch{}
}
function shareUrl(g){const u=new URL('./rsvp.html',location.href);u.searchParams.set('invitation',g.name);return u.href;}
async function copy(g){
 const url=shareUrl(g);try{if(!navigator.clipboard?.writeText)throw Error('Unavailable');
 await navigator.clipboard.writeText(url);message(T('Link copied for ','Αντιγράφηκε σύνδεσμος για ')+g.name);}
 catch{window.prompt(T('Copy the invitation link','Αντιγράψτε τον σύνδεσμο'),url);}
}
function whatsapp(g){
 const m=T('Hello '+g.name+'! We would love to celebrate together. Please RSVP here: ',
 'Γεια σας '+g.name+'! Θα χαρούμε να γιορτάσουμε μαζί. Παρακαλούμε απαντήστε: ')+shareUrl(g);
 window.open('https://wa.me/?text='+encodeURIComponent(m),'_blank','noopener,noreferrer');
}
function backup(){
 if(!loaded())return message(T('Load the guest list before exporting.','Φορτώστε τη λίστα πρώτα.'),true);
 const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),plan},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
 a.download='wedding-guest-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);message(T('Backup downloaded. Keep it private.','Αντίγραφο αποθηκεύτηκε. Φυλάξτε το ιδιωτικά.'));
}
async function commit(mutate,en,gr,deleted=[]){
 if(saving)return false;
 if(!loaded()){message(T('Guest data is unavailable. Refresh first.','Δεν υπάρχουν δεδομένα. Κάντε ανανέωση.'),true);return false;}
 const base=plan,draft=JSON.parse(JSON.stringify(base));
 const applied=mutate(draft);if(applied===false)return false;
 keepCopy(base);saving=true;root.setAttribute('aria-busy','true');
 try{
  const res=await fetch(API+'/wedding/guest-plan',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...draft,deletedGuestIds:deleted}),cache:'no-store'});
  const data=await res.json().catch(()=>({error:'Invalid response'}));
  if(!res.ok){
   if(res.status===409){
    message(T('Another update arrived. Refreshing; please review and retry.','Υπήρξε νεότερη αλλαγή. Ανανεώνεται η λίστα· ελέγξτε και δοκιμάστε ξανά.'),true);
    await load();return false;
   }
   throw Error(data.error||'Save failed');
  }
  if(!Array.isArray(data.plan?.guests)||typeof data.plan.revision!=='string')throw Error('Save not verified');
  plan=data.plan;keepCopy(plan);active=null;
  paint();document.dispatchEvent(new Event('wedding:planning-updated'));
  message(T(en,gr));return true;
 }catch(e){message(T('Not saved: ','Δεν αποθηκεύτηκε: ')+e.message,true);return false;}
 finally{saving=false;root.removeAttribute('aria-busy');render();}
}
function current(id){return plan?.guests?.find(x=>x.id===id);}
function available(table,ignoreId){return Number(table.capacity)-(plan?.guests||[])
 .filter(g=>g.id!==ignoreId&&reply(g)==='yes'&&g.tableId===table.id).reduce((sum,g)=>sum+count(g),0);}
function openEditor(id,mode){active=active?.id===id&&active.mode===mode?null:{id,mode};render();}
function editor(g){
 const section=node('div','gm-inline');const kind=active.mode;
 section.append(node('h3','',kind==='rsvp'?T('Record attendance','Καταγραφή παρουσίας'):T('Edit invitation','Αλλαγή πρόσκλησης')));
 const fields=node('div','gm-fields');
 if(kind==='edit'){
  const name=textInput(g.name,100),adults=numInput(g.invitedAdults??g.partySize,30,T('Adults invited','Ενήλικες')),
   children=numInput(g.invitedChildren??0,30,T('Children invited','Παιδιά'));
  fields.append(field('Name','Όνομα',name,'gm-field-grow'),field('Invited adults','Ενήλικες',adults),field('Children','Παιδιά',children));
  fields.append(button('Save changes','Αποθήκευση',async()=>{
   const n=name.value.trim(),a=Number(adults.value),c=Number(children.value);
   if(n.length<2||adults.value.trim()===''||children.value.trim()===''||!Number.isInteger(a)||!Number.isInteger(c)||a<0||c<0||a+c<1||a+c>30){
    message(T('Enter a name and valid invited numbers.','Συμπληρώστε όνομα και έγκυρους αριθμούς.'),true);return;}
   if(plan.guests.some(x=>x.id!==g.id&&norm(x.name)===norm(n))){
    message(T('That name already exists.','Το όνομα υπάρχει ήδη.'),true);return;}
   if(g.rsvp==='yes'&&((g.adults??0)>a||(g.children??0)>c)){
    message(T('Confirmed attendance exceeds the new invitation. Update RSVP first.','Η επιβεβαιωμένη παρουσία υπερβαίνει τη νέα πρόσκληση. Αλλάξτε πρώτα το RSVP.'),true);return;}
   await commit(d=>{const x=d.guests.find(x=>x.id===g.id);if(!x)return false;
    x.name=n;x.invitedAdults=a;x.invitedChildren=c;x.partySize=a+c;
   },'Invitation updated.','Η πρόσκληση ενημερώθηκε.');
  },'gm-dark'));
 }else{
  section.append(node('p','',T('Select an answer deliberately. Neither option is preselected.','Επιλέξτε μία απάντηση. Καμία επιλογή δεν είναι προεπιλεγμένη.')));
  const yes=document.createElement('input'),no=document.createElement('input');yes.type=no.type='checkbox';
  yes.checked=no.checked=false;
  const option=(input,en,gr)=>{const l=node('label','gm-choice');l.append(input,document.createTextNode(T(en,gr)));return l;};
  const choices=node('div','gm-actions-more');choices.append(option(yes,'Attending','Θα έρθει'),option(no,'Declined','Δεν θα έρθει'));
  section.append(choices);
  const adults=numInput(null,g.invitedAdults??g.partySize,T('Confirmed adults','Επιβεβαιωμένοι ενήλικες'));
  const children=numInput(null,g.invitedChildren??0,T('Confirmed children','Επιβεβαιωμένα παιδιά'));
  const countFields=node('div','gm-fields');countFields.append(field('Adults','Ενήλικες',adults),field('Children','Παιδιά',children));countFields.hidden=true;
  section.append(countFields);
  const update=(chosen,other)=>{if(chosen.checked)other.checked=false;countFields.hidden=!yes.checked;};
  yes.onchange=()=>update(yes,no);no.onchange=()=>update(no,yes);
  fields.append(button('Save RSVP','Αποθήκευση RSVP',async()=>{
   if(yes.checked===no.checked){message(T('Choose attending or declined first.','Επιλέξτε παρουσία ή απουσία.'),true);return;}
   const attending=yes.checked,adultText=adults.value.trim(),childText=children.value.trim();
   if(attending&&adultText===''&&childText===''){message(T('Enter attending adults or children.','Συμπληρώστε πόσοι θα έρθουν.'),true);return;}
   const a=attending?(adultText===''?0:Number(adultText)):0,c=attending?(childText===''?0:Number(childText)):0;
   if(!Number.isInteger(a)||!Number.isInteger(c)||a<0||c<0||attending&&(a+c<1||a>(g.invitedAdults??g.partySize)||c>(g.invitedChildren??0))){
    message(T('Attendance counts are invalid for this invitation.','Λανθασμένοι αριθμοί συμμετοχής.'),true);return;}
   await commit(d=>{const x=d.guests.find(x=>x.id===g.id);if(!x)return false;
    x.rsvp=attending?'yes':'no';x.adults=a;x.children=c;x.updatedAt=new Date().toISOString();if(!attending)x.tableId='';
   },'RSVP saved.','Το RSVP αποθηκεύτηκε.');
  },'gm-dark'));
  fields.append(button('Reset to pending','Επαναφορά σε αναμονή',async()=>{
   if(!window.confirm(T('Reset to unanswered and clear any table assignment?','Επαναφορά σε αναμονή και αφαίρεση τραπεζιού;')))return;
   await commit(d=>{const x=d.guests.find(x=>x.id===g.id);if(!x)return false;
    x.rsvp='pending';x.adults=0;x.children=0;x.tableId='';x.updatedAt=new Date().toISOString();
   },'RSVP reset to unanswered.','Το RSVP έγινε ξανά αναπάντητο.');
  }));
 }
 fields.append(button('Cancel','Ακύρωση',()=>{active=null;render();}));
 section.append(fields);return section;
}
function tableSelect(g){
 const l=node('label','gm-seat-label');l.append(node('span','',T('Table:','Τραπέζι:')));
 const select=document.createElement('select');select.setAttribute('aria-label',T('Seat assignment for ','Τραπέζι για ')+g.name);
 const none=node('option','',T('— Unassigned —','— Χωρίς τραπέζι —'));none.value='';select.append(none);
 for(const t of plan.tables){
  const free=available(t,g.id);const opt=node('option','',t.name+' · '+Math.max(0,free)+' '+T('free','ελεύθερες'));
  opt.value=t.id;opt.disabled=t.id!==g.tableId&&free<count(g);select.append(opt);
 }
 select.value=g.tableId||'';select.disabled=!!g.needsReview||saving;
 select.onchange=async()=>{
  const chosen=select.value,prior=g.tableId||'';if(chosen===prior)return;
  const t=plan.tables.find(x=>x.id===chosen);
  if(t&&available(t,g.id)<count(g)){message(T('Not enough seats at this table.','Δεν υπάρχουν αρκετές θέσεις.'),true);select.value=prior;return;}
  select.disabled=true;
  const ok=await commit(d=>{const x=d.guests.find(x=>x.id===g.id);if(!x||x.rsvp!=='yes'||x.needsReview)return false;x.tableId=chosen;},
    'Table assignment saved.','Το τραπέζι αποθηκεύτηκε.');
  if(!ok)select.value=prior;select.disabled=false;
 };
 l.append(select);return l;
}
async function markSent(g){
 if(saving)return;saving=true;root.setAttribute('aria-busy','true');
 try{
  const old=followup?.[g.id]?.invitationSentAt,action=old?'clear-invited':'invited';
  const res=await fetch(API+'/wedding/rsvp-followup',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:g.id,action}),cache:'no-store'});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Status failed');
  if(!followup)followup={};followup[g.id]=data.entry;
  paint();document.dispatchEvent(new Event('wedding:planning-updated'));
  message(action==='invited'?T('Marked sent. No message was sent automatically.','Σημειώθηκε ως σταλμένη, χωρίς αυτόματη αποστολή.'):
   T('Sent flag cleared.','Αφαιρέθηκε η ένδειξη αποστολής.'));
 }catch(e){message(T('Could not mark invitation: ','Αποτυχία ενημέρωσης: ')+e.message,true);}
 finally{saving=false;root.removeAttribute('aria-busy');render();}
}
function card(g){
 const card=node('article','gm-row'),top=node('div','gm-row-top');
 const id=node('div','gm-identity');
 id.append(node('strong','',g.name),node('small','',T('Invited: ','Προσκεκλημένοι: ')+(g.invitedAdults??g.partySize)+' '+T('adults','ενήλικες')+' · '+(g.invitedChildren??0)+' '+T('children','παιδιά')));
 const actions=node('div','gm-actions'),s=g.needsReview?'review':reply(g);
 const caption=g.needsReview?T('Review RSVP','Για έλεγχο'):s==='yes'?T('Attending','Θα έρθει'):s==='no'?T('Declined','Αρνήθηκε'):T('Awaiting','Αναμονή');
 actions.append(node('span','gm-status-pill '+s+(g.needsReview?' review':''),caption));
 actions.append(button('WhatsApp ↗','WhatsApp ↗',()=>whatsapp(g)));
 actions.append(button('Copy link','Αντιγραφή',()=>copy(g)));
 actions.append(button('RSVP','RSVP',()=>openEditor(g.id,'rsvp'),'gm-accent'));
 actions.append(button('Edit','Αλλαγή',()=>openEditor(g.id,'edit')));
 if(g.needsReview)actions.append(button('✓ Approve','✓ Έγκριση',async()=>{
  await commit(d=>{const x=d.guests.find(x=>x.id===g.id);if(!x)return false;
   x.needsReview=false;x.updatedAt=new Date().toISOString();
  },'Guest approved for seating.','Ο καλεσμένος εγκρίθηκε.');
 }));
 actions.append(button('Remove','Αφαίρεση',async()=>{
  if(!window.confirm(T('Remove '+g.name+' from the list and their table? Export a backup first if needed.',
   'Αφαίρεση '+g.name+' από τη λίστα και το τραπέζι; Κατεβάστε πρώτα αντίγραφο εάν χρειάζεται.')))return;
  await commit(d=>{d.guests=d.guests.filter(x=>x.id!==g.id);},'Guest removed.','Ο καλεσμένος αφαιρέθηκε.',[g.id]);
 }));
 top.append(id,actions);card.append(top);
 const details=node('div','gm-row-details');
 const sent=followup?.[g.id]?.invitationSentAt;
 details.append(button(sent?'✓ Sent':'Mark sent',sent?'✓ Εστάλη':'Καταγραφή αποστολής',()=>markSent(g)));
 if(s==='yes'){
  details.append(node('span','',T('Confirmed: ','Επιβεβαίωσαν: ')+count(g)+' '+T('people','άτομα')));
  if(!g.needsReview)details.append(tableSelect(g));else details.append(node('span','',T('Approve before seating.','Εγκρίνετε πριν την τοποθέτηση σε τραπέζι.')));
 }else if(s==='no')details.append(node('span','',T('No seating required','Δεν χρειάζεται τραπέζι')));
 else details.append(node('span','',T('Awaiting attendance choice','Αναμονή απάντησης')));
 card.append(details);
 if(active?.id===g.id)card.append(editor(g));
 return card;
}
function tableSummary(){
 const area=E('gm-table-summary');area.replaceChildren();
 E('gm-table-count').textContent=loaded()?'('+plan.tables.length+')':'—';
 if(!loaded())return;
 if(!plan.tables.length){area.append(node('span','',T('No tables yet. Create one below.','Δεν υπάρχουν τραπέζια. Προσθέστε ένα παρακάτω.')));return;}
 for(const table of plan.tables){
  const used=plan.guests.filter(g=>reply(g)==='yes'&&g.tableId===table.id).reduce((n,g)=>n+count(g),0);
  area.append(node('span','',table.name+' · '+used+' / '+table.capacity));
 }
}
function render(){
 const list=E('quick-pending-list');list.replaceChildren();
 E('quick-invite-submit').disabled=!loaded()||saving;E('gm-add-table').disabled=!loaded()||saving;
 if(!loaded()){list.append(node('p','gm-helper',T('Loading guest records…','Φόρτωση καλεσμένων…')));return;}
 const all=plan.guests,states={pending:0,yes:0,no:0,unseated:0};
 const tableIds=new Set(plan.tables.map(t=>t.id));
 for(const g of all){states[reply(g)]++;if(reply(g)==='yes'&&(!g.tableId||!tableIds.has(g.tableId)))states.unseated+=count(g);}
 for(const [id,val] of [['gm-total-count',all.length],['quick-pending-count',states.pending],['gm-confirmed-count',states.yes],['gm-declined-count',states.no],['gm-unseated-count',states.unseated]])E(id).textContent=val;
 tableSummary();
 const query=norm(E('gm-search').value),filter=E('gm-filter').value;
 const matches=all.filter(g=>{
  if(query&&!norm(g.name).includes(query))return false;
  if(filter==='all')return true;
  if(filter==='review')return !!g.needsReview;
  if(filter==='unseated')return reply(g)==='yes'&&(!g.tableId||!tableIds.has(g.tableId));
  return reply(g)===filter;
 }).sort((a,b)=>a.name.localeCompare(b.name,localStorage.getItem('wedding-lang')==='el'?'el':'en',{sensitivity:'base'}));
 const pages=Math.max(1,Math.ceil(matches.length/12));page=Math.max(1,Math.min(page,pages));
 const start=(page-1)*12;
 for(const g of matches.slice(start,start+12))list.append(card(g));
 if(!matches.length)list.append(node('p','gm-helper',T('No guests match this filter.','Δεν βρέθηκαν καλεσμένοι με αυτό το φίλτρο.')));
 E('gm-page-info').textContent=matches.length?(start+1)+'–'+Math.min(start+12,matches.length)+' / '+matches.length:'0';
 E('gm-prev').disabled=page<=1;E('gm-next').disabled=page>=pages;
}
E('quick-invite-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const name=E('quick-invite-name').value.trim(),rawA=E('quick-invite-adults').value.trim(),rawC=E('quick-invite-children').value.trim();
 const a=Number(rawA),c=rawC===''?0:Number(rawC);
 if(name.length<2||rawA===''||!Number.isInteger(a)||!Number.isInteger(c)||a<0||c<0||a+c<1||a+c>30){
  message(T('Enter a name and 1–30 invited people.','Εισάγετε όνομα και 1–30 προσκεκλημένους.'),true);return;}
 if((plan?.guests||[]).some(g=>norm(g.name)===norm(name))){
  message(T('This name already exists. Use the list to edit it.','Αυτό το όνομα υπάρχει ήδη. Κάντε αλλαγή από τη λίστα.'),true);return;}
 const guest={id:crypto.randomUUID(),name,invitedAdults:a,invitedChildren:c,partySize:a+c,rsvp:'pending',tableId:''};
 const saved=await commit(d=>{d.guests.push(guest);},'Guest added as unanswered. Share their invitation link below.',
  'Ο καλεσμένος προστέθηκε σε αναμονή. Κοινοποιήστε τον σύνδεσμο.');
 if(!saved)return;
 E('quick-invite-form').reset();E('gm-filter').value='all';E('gm-search').value=name;page=1;render();
 const out=E('quick-invite-created');out.replaceChildren();out.hidden=false;
 out.append(node('span','',T('Added: ','Προστέθηκε: ')+name+' · '),
  button('WhatsApp ↗','WhatsApp ↗',()=>whatsapp(guest)),button('Copy link','Αντιγραφή',()=>copy(guest)));
});
E('gm-table-form').addEventListener('submit',async event=>{
 event.preventDefault();const name=E('gm-table-name').value.trim(),raw=E('gm-table-capacity').value.trim(),capacity=Number(raw);
 if(!name||!raw||!Number.isInteger(capacity)||capacity<1||capacity>50){
  message(T('Enter a table name and 1–50 seats.','Συμπληρώστε όνομα τραπεζιού και 1–50 θέσεις.'),true);return;}
 if((plan?.tables||[]).some(t=>norm(t.name)===norm(name))){message(T('This table name already exists.','Το τραπέζι υπάρχει ήδη.'),true);return;}
 if(plan.tables.length>=100){message(T('Table limit reached.','Φτάσατε το όριο τραπεζιών.'),true);return;}
 const newTable={id:crypto.randomUUID(),name,capacity};
 if(await commit(d=>{d.tables.push(newTable)},'Table created. Assign confirmed guests above.','Το τραπέζι δημιουργήθηκε. Τοποθετήστε καλεσμένους.')){
  E('gm-table-form').reset();E('gm-table-tools').open=true;render();
 }
});
E('gm-backup').onclick=backup;
E('gm-refresh').onclick=async()=>{if(saving)return;await load();message(T('Guest records refreshed.','Η λίστα ανανεώθηκε.'));render();};
E('gm-search').oninput=()=>{page=1;active=null;render();};
E('gm-filter').onchange=()=>{page=1;active=null;render();};
E('gm-prev').onclick=()=>{if(page>1){page--;active=null;render();}};
E('gm-next').onclick=()=>{page++;active=null;render();};
document.addEventListener('wedding:planning-updated',render);
E('language')?.addEventListener('click',()=>setTimeout(render,0));
render();
})();