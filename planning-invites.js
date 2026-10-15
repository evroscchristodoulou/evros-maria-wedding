/* Compact invitation actions for the Planning Centre.
 * Uses the existing version-protected guest plan. No automatic WhatsApp messages. */
(()=>{
  'use strict';
  const root=document.getElementById('quick-invite-desk');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const tr=(en,el)=>localStorage.getItem('wedding-lang')==='el'?el:en;
  const strip=s=>String(s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/\s+/g,' ');
  const linkFor=g=>{const u=new URL('./rsvp.html',location.href);u.searchParams.set('invitation',g.name);return u.href;};
  let busy=false;

  function message(text,isError=false){
    $('quick-invite-status').textContent=text;
    $('quick-invite-status').style.color=isError?'#9e5148':'#706252';
  }
  function button(label,onclick){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=onclick;return b;
  }
  function copyInvite(g){
    const url=linkFor(g);
    navigator.clipboard.writeText(url).then(
      ()=>message(tr('Invitation link copied for ','Ο σύνδεσμος πρόσκλησης αντιγράφηκε για ')+g.name),
      ()=>window.prompt(tr('Copy invitation link:','Αντιγράψτε τον σύνδεσμο:'),url)
    );
  }
  function whatsappInvite(g){
    const msg=tr(
      'Hello '+g.name+'! We would love to celebrate together. Please reply to your invitation here: ',
      'Γεια σας '+g.name+'! Θα χαρούμε να γιορτάσουμε μαζί. Παρακαλούμε απαντήστε στην πρόσκλησή σας εδώ: '
    )+linkFor(g);
    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
  }
  function makeShareButtons(target,g){
    target.append(button(tr('WhatsApp ↗','WhatsApp ↗'),()=>whatsappInvite(g)));
    target.append(button(tr('Copy link','Αντιγραφή'),()=>copyInvite(g)));
  }
  async function savePlan(updated){
    if(busy)return false;
    if(!plan||!Array.isArray(plan.guests)||typeof plan.revision!=='string'){
      message(tr('Guest list is not ready. Refresh the dashboard.','Η λίστα δεν είναι έτοιμη. Ανανεώστε τον πίνακα.'),true);
      return false;
    }
    busy=true;root.setAttribute('aria-busy','true');
    try{
      const r=await fetch(API+'/wedding/guest-plan',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(updated),cache:'no-store'
      });
      const body=await r.json().catch(()=>({error:'Unexpected response'}));
      if(!r.ok)throw Error(body.error||'Could not save');
      if(!Array.isArray(body.plan?.guests)||typeof body.plan.revision!=='string')throw Error('Save was not verified');
      plan=body.plan;
      paint();
      document.dispatchEvent(new Event('wedding:planning-updated'));
      return true;
    }catch(err){
      message(tr('Could not save: ','Αποτυχία αποθήκευσης: ')+err.message,true);
      if(/changed|stale|refresh/i.test(err.message))load();
      return false;
    }finally{
      busy=false;root.removeAttribute('aria-busy');
    }
  }
  function clearCreated(){const out=$('quick-invite-created');out.replaceChildren();out.hidden=true;}
  $('quick-invite-form').addEventListener('submit',async ev=>{
    ev.preventDefault();if(busy)return;
    const name=$('quick-invite-name').value.trim();
    const adultsText=$('quick-invite-adults').value.trim();
    const childrenText=$('quick-invite-children').value.trim();
    const adults=Number(adultsText),children=childrenText===''?0:Number(childrenText);
    if(name.length<2||!Number.isInteger(adults)||!Number.isInteger(children)||adults<0||children<0||adults+children<1||adults+children>30||adultsText===''){
      message(tr('Enter a name and explicit invited numbers (1–30 people).','Συμπληρώστε όνομα και αριθμό προσκεκλημένων (1–30 άτομα).'),true);return;
    }
    if(!plan||!Array.isArray(plan.guests)){message(tr('Load the Guest List before adding invitations.','Φορτώστε τη λίστα καλεσμένων πριν την προσθήκη.'),true);return;}
    if(plan.guests.some(g=>strip(g.name)===strip(name))){
      message(tr('That name already exists. Use the pending list below or the Guest List to avoid duplicates.','Το όνομα υπάρχει ήδη. Επιλέξτε το από τη λίστα ώστε να μη δημιουργηθεί διπλό.'),true);
      return;
    }
    const guest={id:crypto.randomUUID(),name,partySize:adults+children,invitedAdults:adults,invitedChildren:children,rsvp:'pending',tableId:''};
    const updated={...plan,guests:[...plan.guests,guest]};
    if(!await savePlan(updated))return;
    $('quick-invite-form').reset();
    const actual=plan.guests.find(g=>g.id===guest.id)||guest;
    const out=$('quick-invite-created');out.replaceChildren();out.hidden=false;
    const info=document.createElement('span');info.textContent=tr('Added as awaiting RSVP: ','Προστέθηκε σε αναμονή RSVP: ')+actual.name+' · ';
    out.append(info);makeShareButtons(out,actual);
    message(tr('Invitation saved. Use WhatsApp or Copy link to share it; it has not been sent automatically.','Η πρόσκληση αποθηκεύτηκε. Κοινοποιήστε τη μέσω WhatsApp ή αντιγραφής· δεν εστάλη αυτόματα.'));
    $('quick-invite-name').focus();
  });

  function attendanceForm(guest,actions){
    // Both boxes are intentionally unchecked for unanswered invitations.
    const yes=document.createElement('input'),no=document.createElement('input');
    yes.type=no.type='checkbox';yes.checked=false;no.checked=false;
    const label=(field,en,el)=>{const elmt=document.createElement('label');elmt.append(field,document.createTextNode(tr(en,el)));return elmt;};
    actions.append(label(yes,'Attending','Θα έρθει'),label(no,'Declined','Δεν θα έρθει'));
    const editor=document.createElement('div');editor.className='quick-pending-counts';editor.hidden=true;
    const adults=document.createElement('input'),children=document.createElement('input');
    adults.type=children.type='number';adults.min=children.min='0';
    adults.max=String(guest.invitedAdults??guest.partySize);children.max=String(guest.invitedChildren??0);
    adults.placeholder=children.placeholder='0';adults.value=children.value='';
    adults.setAttribute('aria-label',tr('Attending adults','Ενήλικες που θα έρθουν'));
    children.setAttribute('aria-label',tr('Attending children','Παιδιά που θα έρθουν'));
    const saveBtn=button(tr('Save response','Αποθήκευση'),async()=>{
      if(busy)return;
      const isYes=yes.checked,isNo=no.checked;
      if(isYes===isNo)return;
      const a=isYes?(adults.value.trim()===''?0:Number(adults.value)):0;
      const c=isYes?(children.value.trim()===''?0:Number(children.value)):0;
      if(isYes&&adults.value.trim()===''&&children.value.trim()===''){
        message(tr('Enter the confirmed number of adults and/or children.','Συμπληρώστε πόσοι ενήλικες ή/και παιδιά θα έρθουν.'),true);adults.focus();return;
      }
      if(!Number.isInteger(a)||!Number.isInteger(c)||a<0||c<0||a+c>30||
        isYes&&(a+c<1||a>Number(adults.max)||c>Number(children.max))){
        message(tr('Confirm numbers within the original invitation.','Ελέγξτε ότι οι αριθμοί είναι εντός πρόσκλησης.'),true);return;
      }
      if(!plan)return;
      const current=plan.guests.find(g=>g.id===guest.id);
      if(!current||current.rsvp!=='pending'){
        message(tr('This RSVP has changed. Refresh before saving.','Η απάντηση έχει αλλάξει. Ανανεώστε τη λίστα.'),true);return;
      }
      const updated={...plan,guests:plan.guests.map(g=>g.id===guest.id?
        {...g,rsvp:isYes?'yes':'no',adults:a,children:c,tableId:isYes?(g.tableId||''):'',updatedAt:new Date().toISOString()}:g)};
      if(await savePlan(updated))message(tr('RSVP recorded for ','Καταχωρίστηκε RSVP για ')+guest.name);
    });
    editor.append(document.createTextNode(tr('Adults','Ενήλικες')),adults,
      document.createTextNode(tr('Children','Παιδιά')),children,saveBtn);
    const toggle=(chosen,other)=>{
      if(chosen.checked)other.checked=false;
      editor.hidden=!(yes.checked||no.checked);
      adults.disabled=children.disabled=!yes.checked;
    };
    yes.onchange=()=>toggle(yes,no);no.onchange=()=>toggle(no,yes);
    return editor;
  }
  function render(){
    const area=$('quick-pending-list'),total=$('quick-pending-count');
    area.replaceChildren();
    if(!plan||!Array.isArray(plan.guests)){
      total.textContent='—';
      const p=document.createElement('p');p.textContent=tr('Loading RSVP records…','Φόρτωση RSVP…');area.append(p);
      $('quick-invite-submit').disabled=true;return;
    }
    $('quick-invite-submit').disabled=false;
    const pending=plan.guests.filter(g=>g.rsvp!=='yes'&&g.rsvp!=='no'&&!g.needsReview)
      .sort((a,b)=>a.name.localeCompare(b.name,localStorage.getItem('wedding-lang')==='el'?'el':'en',{sensitivity:'base'}));
    total.textContent='('+pending.length+')';
    if(!pending.length){const p=document.createElement('p');p.textContent=tr('No unanswered invitations.','Δεν υπάρχουν αναπάντητες προσκλήσεις.');area.append(p);return;}
    for(const g of pending.slice(0,50)){
      const row=document.createElement('div');row.className='quick-pending-row';
      const name=document.createElement('strong');name.className='quick-pending-name';name.textContent=g.name;
      const actions=document.createElement('div');actions.className='quick-pending-actions';
      makeShareButtons(actions,g);
      const editor=attendanceForm(g,actions);
      row.append(name,actions,editor);area.append(row);
    }
    if(pending.length>50){const p=document.createElement('p');p.style.fontSize='11px';p.textContent=tr('Showing 50 invitations. Open RSVP Follow-up for the rest.','Εμφανίζονται 50 προσκλήσεις. Δείτε τις υπόλοιπες στις υπενθυμίσεις RSVP.');area.append(p);}
  }
  document.addEventListener('wedding:planning-updated',render);
  document.getElementById('language')?.addEventListener('click',()=>setTimeout(render,0));
  clearCreated();render();
})();