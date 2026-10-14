export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const origin='https://evroscchristodoulou.github.io';
    const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-Wedding-Sync-Key','Cache-Control':'no-store','Vary':'Origin'};
    if(url.pathname.startsWith('/wedding/') || url.pathname==='/photos/delete'){
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
      const json=(body,status=200)=>Response.json(body,{status,headers:cors});
      const admin=!!env.ADMIN_SECRET && request.headers.get('Authorization')==='Bearer '+env.ADMIN_SECRET;
      if(!env.SUBSCRIBERS)return json({error:'Storage unavailable'},503);
      if(request.method!=='GET' && request.headers.get('Origin')!==origin)return json({error:'Forbidden'},403);

      // Wedding predictions: public anonymous nickname entries, admin-only result reveal.
      if(url.pathname==='/wedding/predictions' && ['GET','POST'].includes(request.method)){
        const configKey='wedding:predictions:config:v1';
        const questions=[
          {id:'dance',en:'Which style will the first dance be?',el:'Τι στυλ θα έχει ο πρώτος χορός;',options:[['Romantic','Ρομαντικός'],['Upbeat','Ξεσηκωτικός'],['Surprise','Έκπληξη']]},
          {id:'cake',en:'How many tiers will the wedding cake have?',el:'Πόσους ορόφους θα έχει η γαμήλια τούρτα;',options:[['Two','Δύο'],['Three','Τρεις'],['Four or more','Τέσσερις ή περισσότεροι']]},
          {id:'entrance',en:'What will the couple’s entrance be like?',el:'Πώς θα είναι η είσοδος του ζευγαριού;',options:[['Classic','Κλασική'],['Dance entrance','Με χορό'],['Surprise','Έκπληξη']]}
        ];
        const cfg=await env.SUBSCRIBERS.get(configKey,'json')||{open:true,revealed:false,answers:{}};
        if(request.method==='GET'){
          let entries=[];const listing=await env.SUBSCRIBERS.list({prefix:'wedding:prediction:entry:',limit:1000});
          const records=await Promise.all(listing.keys.map(k=>env.SUBSCRIBERS.get(k.name,'json')));entries=records.filter(Boolean);
          const scores=cfg.revealed?entries.map(x=>({nickname:x.nickname,score:questions.reduce((n,q)=>n+(x.picks[q.id]===cfg.answers?.[q.id]?1:0),0)})).sort((a,b)=>b.score-a.score).slice(0,20):[];
          return json({questions,open:cfg.open,revealed:cfg.revealed,entries:entries.length,leaderboard:scores});
        }
        const raw=await request.text();if(raw.length>3000)return json({error:'Request too large'},413);
        let d;try{d=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
        if(d?.action==='configure'){
          if(!env.ANNOUNCEMENTS_ADMIN_KEY||request.headers.get('Authorization')!=='Bearer '+env.ANNOUNCEMENTS_ADMIN_KEY)return json({error:'Publishing key required'},401);
          if(typeof d.open!=='boolean'||typeof d.revealed!=='boolean'||!d.answers||questions.some(q=>!Number.isInteger(d.answers[q.id])||d.answers[q.id]<0||d.answers[q.id]>2))return json({error:'Invalid results'},400);
          await env.SUBSCRIBERS.put(configKey,JSON.stringify({open:d.open,revealed:d.revealed,answers:d.answers}));
          return json({ok:true});
        }
        if(d?.action!=='enter'||!cfg.open||cfg.revealed)return json({error:'Competition closed'},403);
        const nickname=String(d.nickname||'').trim(),token=String(d.token||'');
        if(nickname.length<2||nickname.length>28||!/^[a-zA-Z0-9_\u0370-\u03ff\u1f00-\u1fff -]+$/.test(nickname)||!/^[a-f0-9-]{36}$/.test(token))return json({error:'Invalid nickname or token'},400);
        if(!d.picks||questions.some(q=>!Number.isInteger(d.picks[q.id])||d.picks[q.id]<0||d.picks[q.id]>2))return json({error:'Choose all predictions'},400);
        const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
        const key='wedding:prediction:entry:'+tokenHash;
        if(await env.SUBSCRIBERS.get(key))return json({error:'This device has already submitted a prediction'},409);
        await env.SUBSCRIBERS.put(key,JSON.stringify({nickname,picks:d.picks,createdAt:new Date().toISOString()}));
        return json({ok:true});
      }

      // Public wedding announcements. Publishing requires a server-side secret.
      if(url.pathname==='/wedding/announcements' && (request.method==='GET'||request.method==='POST')){
        const key='wedding:public:announcements:v1';
        if(request.method==='GET'){
          const stored=await env.SUBSCRIBERS.get(key,'json');
          const canManage=!!env.ANNOUNCEMENTS_ADMIN_KEY && request.headers.get('Authorization')==='Bearer '+env.ANNOUNCEMENTS_ADMIN_KEY;
          return json({announcements:Array.isArray(stored?.announcements)?(canManage?stored.announcements:stored.announcements.filter(a=>a.published===true)):[],updatedAt:stored?.updatedAt||null});
        }
        if(!env.ANNOUNCEMENTS_ADMIN_KEY || request.headers.get('Authorization')!=='Bearer '+env.ANNOUNCEMENTS_ADMIN_KEY)return json({error:'Invalid publishing key'},401);
        const raw=await request.text();if(raw.length>30000)return json({error:'Too large'},413);
        let input;try{input=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
        if(!input||!Array.isArray(input.announcements)||input.announcements.length>30)return json({error:'Invalid announcements'},400);
        const valid=input.announcements.every(a=>a&&typeof a.id==='string'&&a.id.length<=80&&typeof a.titleEn==='string'&&a.titleEn.trim()&&a.titleEn.length<=140&&typeof a.titleEl==='string'&&a.titleEl.length<=140&&typeof a.bodyEn==='string'&&a.bodyEn.trim()&&a.bodyEn.length<=1800&&typeof a.bodyEl==='string'&&a.bodyEl.length<=1800&&typeof a.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)&&typeof a.published==='boolean');
        if(!valid)return json({error:'Invalid announcement entry'},400);
        const announcements=input.announcements.map(a=>({id:a.id,titleEn:a.titleEn.trim(),titleEl:a.titleEl.trim(),bodyEn:a.bodyEn.trim(),bodyEl:a.bodyEl.trim(),date:a.date,published:a.published}));
        const updatedAt=new Date().toISOString();
        await env.SUBSCRIBERS.put(key,JSON.stringify({announcements,updatedAt}));
        return json({ok:true,updatedAt});
      }

      // Test-only cross-device budget. A high-entropy pairing key identifies each isolated workspace.
      if(url.pathname==='/wedding/budget-sync' && (request.method==='GET'||request.method==='POST')){
        const token=request.headers.get('X-Wedding-Sync-Key')||'';
        if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Pairing key required'},401);
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
        const identity=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
        const storageKey='wedding:test-budget:'+identity;
        const stored=await env.SUBSCRIBERS.get(storageKey,'json');
        if(request.method==='GET')return json({exists:!!stored,data:stored?.data||[],revision:stored?.revision||null,updatedAt:stored?.updatedAt||null});
        const raw=await request.text();
        if(raw.length>100000)return json({error:'Budget too large'},413);
        let input;try{input=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
        if(!input||!Array.isArray(input.data)||input.data.length>500)return json({error:'Invalid budget'},400);
        const valid=input.data.every(x=>x&&typeof x.id==='string'&&x.id.length<=90&&typeof x.name==='string'&&x.name.length<=100&&x.name.trim()&&typeof x.category==='string'&&x.category.length<=60&&Number.isFinite(x.cost)&&x.cost>=0&&x.cost<=100000000&&Array.isArray(x.payments)&&x.payments.length<=300&&x.payments.every(p=>p&&typeof p.id==='string'&&p.id.length<=90&&Number.isFinite(p.amount)&&p.amount>0&&p.amount<=100000000&&typeof p.date==='string'&&p.date.length<=10&&typeof p.note==='string'&&p.note.length<=180)&&typeof x.due==='string'&&x.due.length<=10&&typeof x.notes==='string'&&x.notes.length<=300);
        if(!valid)return json({error:'Invalid expense records'},400);
        if((input.revision||null)!==(stored?.revision||null))return json({error:'Budget changed on another device. Refresh to review before saving.',revision:stored?.revision||null},409);
        const revision=crypto.randomUUID(),updatedAt=new Date().toISOString();
        await env.SUBSCRIBERS.put(storageKey,JSON.stringify({data:input.data,revision,updatedAt}));
        return json({ok:true,revision,updatedAt});
      }

      // PUBLIC TEST MODE ONLY. All visitors share one sample budget; never store actual private finances here.
      if(url.pathname==='/wedding/budget-shared' && (request.method==='GET'||request.method==='POST')){
        if(!env.BUDGET_DB)return json({error:'Shared test budget database unavailable'},503);
        const db=env.BUDGET_DB;
        if(request.method==='GET'){
          const [e,p]=await Promise.all([
            db.prepare('SELECT id,name,category,cost,due,remindDays,notes FROM expenses ORDER BY rowid').all(),
            db.prepare('SELECT id,expense_id,amount,date,note FROM payments ORDER BY rowid').all()
          ]);
          const data=(e.results||[]).map(x=>({...x,remindDays:Number(x.remindDays??3),payments:[]}));
          const byId=new Map(data.map(x=>[x.id,x]));
          for(const pay of p.results||[]){const entry=byId.get(pay.expense_id);if(entry)entry.payments.push({id:pay.id,amount:pay.amount,date:pay.date,note:pay.note})}
          return json({data,testMode:true});
        }
        const raw=await request.text();
        if(raw.length>120000)return json({error:'Request too large'},413);
        let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
        const ops=body?.operations;
        if(!Array.isArray(ops)||ops.length<1||ops.length>150)return json({error:'Invalid operations'},400);
        const idOK=x=>typeof x==='string'&&x.length>0&&x.length<=90;
        const dateOK=x=>typeof x==='string'&&(x===''||/^\d{4}-\d{2}-\d{2}$/.test(x));
        const expenseOK=x=>x&&idOK(x.id)&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=100&&typeof x.category==='string'&&x.category.length<=60&&Number.isFinite(x.cost)&&x.cost>=0&&x.cost<=100000000&&dateOK(x.due)&&Number.isInteger(Number(x.remindDays))&&Number(x.remindDays)>=0&&Number(x.remindDays)<=30&&typeof x.notes==='string'&&x.notes.length<=300&&Array.isArray(x.payments)&&x.payments.length<=250&&x.payments.every(paymentOK);
        function paymentOK(x){return x&&idOK(x.id)&&Number.isFinite(x.amount)&&x.amount>0&&x.amount<=100000000&&dateOK(x.date)&&typeof x.note==='string'&&x.note.length<=180}
        const statements=[];
        const addExpense=(e)=>{
          statements.push(db.prepare('INSERT OR IGNORE INTO expenses(id,name,category,cost,due,remindDays,notes) VALUES(?,?,?,?,?,?,?)').bind(e.id,e.name,e.category,e.cost,e.due,e.remindDays,e.notes));
          for(const p of e.payments)statements.push(db.prepare('INSERT OR IGNORE INTO payments(id,expense_id,amount,date,note) VALUES(?,?,?,?,?)').bind(p.id,e.id,p.amount,p.date,p.note));
        };
        for(const op of ops){
          if(!op||typeof op.type!=='string')return json({error:'Invalid operation'},400);
          if(op.type==='add_expense'){
            if(!expenseOK(op.expense))return json({error:'Invalid expense'},400);
            addExpense(op.expense);
          }else if(op.type==='update_expense'){
            if(!idOK(op.id)||!op.fields||typeof op.fields!=='object'||Array.isArray(op.fields))return json({error:'Invalid update'},400);
            const keys=Object.keys(op.fields);
            const allowed=['name','category','cost','due','remindDays','notes'];
            if(keys.length===0||keys.length>allowed.length||keys.some(k=>!allowed.includes(k)))return json({error:'Invalid fields'},400);
            const merged={id:op.id,name:'Placeholder',category:'Other',cost:0,due:'',remindDays:3,notes:'',payments:[],...op.fields};
            if(!expenseOK(merged))return json({error:'Invalid expense changes'},400);
            statements.push(db.prepare('UPDATE expenses SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?').bind(...keys.map(k=>op.fields[k]),op.id));
          }else if(op.type==='add_payment'){
            if(!idOK(op.expenseId)||!paymentOK(op.payment))return json({error:'Invalid payment'},400);
            const p=op.payment;
            statements.push(db.prepare('INSERT OR IGNORE INTO payments(id,expense_id,amount,date,note) VALUES(?,?,?,?,?)').bind(p.id,op.expenseId,p.amount,p.date,p.note));
          }else if(op.type==='delete_payment'){
            if(!idOK(op.id))return json({error:'Invalid payment ID'},400);
            statements.push(db.prepare('DELETE FROM payments WHERE id=?').bind(op.id));
          }else if(op.type==='delete_expense'){
            if(!idOK(op.id))return json({error:'Invalid expense ID'},400);
            statements.push(db.prepare('DELETE FROM payments WHERE expense_id=?').bind(op.id));
            statements.push(db.prepare('DELETE FROM expenses WHERE id=?').bind(op.id));
          }else if(op.type==='replace_all'){
            if(ops.length!==1||!Array.isArray(op.data)||op.data.length>200||!op.data.every(expenseOK))return json({error:'Invalid replacement data'},400);
            statements.push(db.prepare('DELETE FROM payments'));
            statements.push(db.prepare('DELETE FROM expenses'));
            for(const e of op.data)addExpense(e);
          }else return json({error:'Unknown operation'},400);
          if(statements.length>1000)return json({error:'Too many database updates'},413);
        }
        try{
          await db.batch(statements);
          return json({ok:true,operations:ops.length});
        }catch(e){return json({error:'Could not save budget changes'},503)}
      }
      // Financial data and checklist must not be exposed via unauthenticated public APIs.
      if(url.pathname==='/wedding/private-data'){
        if(!admin)return json({error:'Administrator authentication required'},401);
        const type=url.searchParams.get('type');if(!['budget','checklist'].includes(type))return json({error:'Invalid type'},400);
        const key='wedding:private:'+type;
        if(request.method==='GET')return json({data:await env.SUBSCRIBERS.get(key,'json')||[]});
        if(request.method==='POST'){const raw=await request.text();if(raw.length>150000)return json({error:'Too large'},413);let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!Array.isArray(data)||data.length>1000)return json({error:'Invalid data'},400);await env.SUBSCRIBERS.put(key,JSON.stringify(data));return json({ok:true})}
      }
      if(url.pathname==='/wedding/submit' && request.method==='POST'){
        const length=Number(request.headers.get('Content-Length')||0);if(length>4096)return json({error:'Too long'},413);
        let data;try{data=await request.json()}catch{return json({error:'Invalid JSON'},400)}
        const type=data.type; if(!['song','wish'].includes(type))return json({error:'Invalid type'},400);
        const name=String(data.name||'').trim().slice(0,80);
        const message=String(data.message||'').trim().slice(0,500);
        const artist=String(data.artist||'').trim().slice(0,100);
        if(!name||!message|| (type==='song'&&!artist))return json({error:'Please complete all fields'},400);
        const key='wedding:'+type+':'+new Date().toISOString()+':'+crypto.randomUUID();
        await env.SUBSCRIBERS.put(key,JSON.stringify({id:key,type,name,message,artist: type==='song'?artist:'',approved:false,createdAt:new Date().toISOString()}));
        return json({ok:true,moderation:true},201);
      }
      // RSVP entries are stored in KV. A private edit token is returned only to the submitting guest.
      // TEST MODE: unauthenticated guest management. Enable authentication before real guest data.
      if(url.pathname==='/wedding/seating/public' && request.method==='GET'){
        const plan=await env.SUBSCRIBERS.get('wedding:test:guest-plan','json');
        if(!plan?.published)return json({published:false,tables:[]});
        return json({published:true,tables:plan.tables.map(t=>({id:t.id,name:t.name,capacity:t.capacity})),guests:plan.guests.filter(g=>g.rsvp==='yes'&&g.tableId&&plan.tables.some(t=>t.id===g.tableId)).map(g=>({name:g.name,partySize:g.partySize,tableId:g.tableId}))});
      }
      // Shared TEST checklist. Per-task KV records avoid replacing the whole checklist.
      // No authentication yet: keep this endpoint free of sensitive information.
      if(url.pathname==='/wedding/checklist' && (request.method==='GET'||request.method==='POST')){
        const prefix='wedding:test:checklist:';
        if(request.method==='GET'){
          const entries=[];let cursor;
          do{
            const page=await env.SUBSCRIBERS.list({prefix,cursor,limit:100});
            const batch=await Promise.all(page.keys.map(k=>env.SUBSCRIBERS.get(k.name,'json')));
            for(const entry of batch)if(entry)entries.push(entry);
            cursor=page.list_complete?undefined:page.cursor;
          }while(cursor&&entries.length<1500);
          return json({entries,testMode:true});
        }
        const raw=await request.text();
        if(raw.length>95000)return json({error:'Request too large'},413);
        let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
        const operations=body?.operations;
        if(!Array.isArray(operations)||operations.length<1||operations.length>50)return json({error:'Invalid operations'},400);
        const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=90&&/^[a-zA-Z0-9_-]+$/.test(v);
        const valid=operations.every(op=>op&&idOK(op.id)&&(
          op.type==='delete'||(op.type==='upsert'&&typeof op.name==='string'&&op.name.trim().length>0&&op.name.length<=180&&typeof op.done==='boolean'&&typeof op.due==='string'&&(op.due===''||/^\d{4}-\d{2}-\d{2}$/.test(op.due))
          )));
        if(!valid)return json({error:'Invalid task data'},400);
        for(const op of operations){
          const record=op.type==='delete'?{id:op.id,deleted:true,updatedAt:new Date().toISOString()}:{id:op.id,name:op.name.trim(),due:op.due,done:op.done,deleted:false,updatedAt:new Date().toISOString()};
          await env.SUBSCRIBERS.put(prefix+op.id,JSON.stringify(record));
        }
        return json({ok:true,count:operations.length});
      }

      // Wedding invitation follow-up metadata is stored separately from the guest plan.
      // No messages are sent by the server; staff record invitations/reminders manually.
      if(url.pathname==='/wedding/rsvp-followup' && (request.method==='GET'||request.method==='POST')){
        const prefix='wedding:followup:';
        if(request.method==='GET'){
          const records={};let cursor;
          do{
            const page=await env.SUBSCRIBERS.list({prefix,cursor,limit:100});
            for(const item of page.keys){
              const entry=await env.SUBSCRIBERS.get(item.name,'json');
              if(entry)records[item.name.slice(prefix.length)]=entry;
            }
            cursor=page.list_complete?undefined:page.cursor;
          }while(cursor&&Object.keys(records).length<1500);
          return json({records});
        }
        const d=await request.json().catch(()=>null);
        if(!d||typeof d.id!=='string'||d.id.length>80||!['invited','reminded','clear-invited','clear-reminded'].includes(d.action))return json({error:'Invalid follow-up update'},400);
        const plan=await env.SUBSCRIBERS.get('wedding:test:guest-plan','json')||{guests:[]};
        if(!plan.guests.some(g=>g.id===d.id))return json({error:'Guest not found'},404);
        const key=prefix+d.id,entry=await env.SUBSCRIBERS.get(key,'json')||{invitationSentAt:null,lastReminderAt:null,reminderCount:0};
        const now=new Date().toISOString();
        if(d.action==='invited')entry.invitationSentAt=now;
        if(d.action==='reminded'){entry.lastReminderAt=now;entry.reminderCount=Math.min(9999,(Number(entry.reminderCount)||0)+1)}
        if(d.action==='clear-invited')entry.invitationSentAt=null;
        if(d.action==='clear-reminded'){entry.lastReminderAt=null;entry.reminderCount=0}
        await env.SUBSCRIBERS.put(key,JSON.stringify(entry));
        return json({ok:true,entry});
      }
      if(url.pathname==='/wedding/guest-plan'){
        const key='wedding:test:guest-plan';
        if(request.method==='GET')return json({plan:await env.SUBSCRIBERS.get(key,'json')||{tables:[],guests:[],published:false}});
        if(request.method==='POST'){
          const d=await request.json().catch(()=>null);
          if(!d||!Array.isArray(d.guests)||!Array.isArray(d.tables)||d.guests.length>1000||d.tables.length>100)return json({error:'Invalid guest plan'},400);
          const old=await env.SUBSCRIBERS.get(key,'json')||{tables:[],guests:[]};
          const oldById=new Map(old.guests.map(x=>[x.id,x]));
          const guests=d.guests.map(x=>{const prior=oldById.get(x.id);return {id:String(x.id||'').slice(0,80),name:String(x.name||'').trim().slice(0,100),partySize:Number(x.partySize),invitedAdults:Number.isInteger(x.invitedAdults)?x.invitedAdults:Number(x.partySize),invitedChildren:Number.isInteger(x.invitedChildren)?x.invitedChildren:0,rsvp:['yes','no','pending'].includes(x.rsvp)?x.rsvp:'pending',adults:Number.isInteger(x.adults)?x.adults:undefined,children:Number.isInteger(x.children)?x.children:undefined,tableId:x.rsvp==='yes'?String(x.tableId||'').slice(0,80):'',updatedAt:prior?.updatedAt||null}});
          if(guests.some(x=>!x.id||!x.name||!Number.isInteger(x.partySize)||x.partySize<1||x.partySize>30||x.invitedAdults<0||x.invitedChildren<0||x.invitedAdults+x.invitedChildren!==x.partySize)||new Set(guests.map(x=>x.id)).size!==guests.length)return json({error:'Invalid guest records'},400);
          const tables=d.tables.map(x=>({id:String(x.id||'').slice(0,80),name:String(x.name||'').trim().slice(0,80),capacity:Number(x.capacity)}));
          if(tables.some(x=>!x.id||!x.name||!Number.isInteger(x.capacity)||x.capacity<1||x.capacity>50))return json({error:'Invalid tables'},400);
          for(const t of tables)if(guests.filter(x=>x.tableId===t.id).reduce((n,x)=>n+x.partySize,0)>t.capacity)return json({error:'Table capacity exceeded'},400);
          await env.SUBSCRIBERS.put(key,JSON.stringify({tables,guests,published:!!d.published}));
          return json({ok:true});
        }
      }
      if(url.pathname==='/wedding/invitation/search'&&request.method==='POST'){
        const d=await request.json().catch(()=>null),query=String(d?.name||'').trim().toLocaleLowerCase();
        if(query.length<3)return json({error:'Enter at least three characters'},400);
        const plan=await env.SUBSCRIBERS.get('wedding:test:guest-plan','json')||{guests:[]};
        return json({matches:plan.guests.filter(x=>x.name.toLocaleLowerCase().includes(query)).slice(0,12).map(x=>({id:x.id,name:x.name,partySize:x.partySize,invitedAdults:x.invitedAdults??x.partySize,invitedChildren:x.invitedChildren??0,rsvp:x.rsvp}))});
      }
      if(url.pathname==='/wedding/invitation/reply'&&request.method==='POST'){
        const d=await request.json().catch(()=>null);
        if(!d||typeof d.id!=='string'||typeof d.attending!=='boolean')return json({error:'Invalid RSVP'},400);
        const key='wedding:test:guest-plan',plan=await env.SUBSCRIBERS.get(key,'json')||{guests:[]};
        const guest=plan.guests.find(x=>x.id===d.id);if(!guest)return json({error:'Invitation not found'},404);
        const adults=Number(d.adults),children=Number(d.children);
        if(!Number.isInteger(adults)||!Number.isInteger(children)||adults<0||children<0||adults>(d.attending?(guest.invitedAdults??guest.partySize):0)||children>(d.attending?(guest.invitedChildren??0):0)||d.attending&&adults+children<1||!d.attending&&(adults!==0||children!==0))return json({error:'Invalid attendance count'},400);
        guest.rsvp=d.attending?'yes':'no';guest.adults=adults;guest.children=children;if(!d.attending)guest.tableId='';
        guest.updatedAt=new Date().toISOString();
        await env.SUBSCRIBERS.put(key,JSON.stringify(plan));return json({ok:true});
      }
      if(url.pathname==='/wedding/rsvp' && request.method==='POST'){
        const raw=await request.text();if(raw.length>4096)return json({error:'Request too long'},413);
        let d;try{d=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
        const name=String(d.name||'').trim().slice(0,100);
        const attending=d.attending;
        const adults=Number(d.adults),children=Number(d.children);
        const dietary=String(d.dietary||'').trim().slice(0,400);
        const notes=String(d.notes||'').trim().slice(0,400);
        if(!name||typeof attending!=='boolean'||!Number.isInteger(adults)||!Number.isInteger(children)||adults<0||adults>20||children<0||children>20||(attending&&adults+children<1)||(!attending&&(adults!==0||children!==0)))return json({error:'Invalid RSVP details'},400);
        const id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID();
        const entry={id,name,attending,adults,children,dietary,notes,token,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await env.SUBSCRIBERS.put('wedding:rsvp:'+id,JSON.stringify(entry));
        return json({ok:true,id,token},201);
      }
      if(url.pathname==='/wedding/rsvp/manage' && request.method==='POST'){
        const d=await request.json().catch(()=>null);
        if(!d||typeof d.id!=='string'||typeof d.token!=='string'||!/^[a-f0-9-]{36}$/.test(d.id))return json({error:'Invalid request'},400);
        const key='wedding:rsvp:'+d.id,old=await env.SUBSCRIBERS.get(key,'json');
        if(!old||old.token!==d.token)return json({error:'RSVP not found or link invalid'},404);
        if(d.action==='read')return json({entry:{name:old.name,attending:old.attending,adults:old.adults,children:old.children,dietary:old.dietary,notes:old.notes}});
        if(d.action==='delete'){await env.SUBSCRIBERS.delete(key);return json({ok:true})}
        if(d.action!=='edit')return json({error:'Invalid action'},400);
        const name=String(d.name||'').trim().slice(0,100),attending=d.attending,adults=Number(d.adults),children=Number(d.children);
        if(!name||typeof attending!=='boolean'||!Number.isInteger(adults)||!Number.isInteger(children)||adults<0||adults>20||children<0||children>20||(attending&&adults+children<1)||(!attending&&(adults!==0||children!==0)))return json({error:'Invalid RSVP details'},400);
        Object.assign(old,{name,attending,adults,children,dietary:String(d.dietary||'').trim().slice(0,400),notes:String(d.notes||'').trim().slice(0,400),updatedAt:new Date().toISOString()});
        await env.SUBSCRIBERS.put(key,JSON.stringify(old));return json({ok:true});
      }
      if(url.pathname==='/wedding/rsvp/summary' && request.method==='GET'){
        let cursor;const totals={responses:0,attending:0,declined:0,adults:0,children:0};
        do{const page=await env.SUBSCRIBERS.list({prefix:'wedding:rsvp:',cursor,limit:100});for(const k of page.keys){const e=await env.SUBSCRIBERS.get(k.name,'json');if(!e)continue;totals.responses++;if(e.attending){totals.attending++;totals.adults+=e.adults;totals.children+=e.children}else totals.declined++}cursor=page.list_complete?undefined:page.cursor}while(cursor&&totals.responses<10000);
        return json({summary:totals});
      }
      // Seating assignments remain private until server-side admin authentication is configured.
      // Guest records and table assignments must never be exposed via unauthenticated GET.
      if(url.pathname==='/wedding/seating/manage'){
        if(!admin)return json({error:'Admin authentication required for seating',reason:!env.ADMIN_SECRET?'admin_secret_missing':'credentials_mismatch'},401);
        const key='wedding:seating:plan';
        if(request.method==='GET'){
          const plan=await env.SUBSCRIBERS.get(key,'json')||{tables:[],guests:[],published:false};
          return json({plan});
        }
        if(request.method==='POST'){
          const d=await request.json().catch(()=>null);
          if(!d||!Array.isArray(d.tables)||!Array.isArray(d.guests)||d.tables.length>100||d.guests.length>1000)return json({error:'Invalid plan'},400);
          const tables=d.tables.map(t=>({id:String(t.id||'').slice(0,80),name:String(t.name||'').trim().slice(0,80),capacity:Number(t.capacity)}));
          if(tables.some(t=>!t.id||!t.name||!Number.isInteger(t.capacity)||t.capacity<1||t.capacity>50)||new Set(tables.map(t=>t.id)).size!==tables.length)return json({error:'Invalid tables'},400);
          const ids=new Set(tables.map(t=>t.id));
          const guests=d.guests.map(g=>({id:String(g.id||'').slice(0,80),name:String(g.name||'').trim().slice(0,100),tableId:g.tableId?String(g.tableId).slice(0,80):'',partySize:Number(g.partySize)}));
          if(guests.some(g=>!g.id||!g.name||!Number.isInteger(g.partySize)||g.partySize<1||g.partySize>30||(g.tableId&&!ids.has(g.tableId)))||new Set(guests.map(g=>g.id)).size!==guests.length)return json({error:'Invalid guests'},400);
          for(const t of tables)if(guests.filter(g=>g.tableId===t.id).reduce((n,g)=>n+g.partySize,0)>t.capacity)return json({error:'Table capacity exceeded: '+t.name},400);
          await env.SUBSCRIBERS.put(key,JSON.stringify({tables,guests,published:false,updatedAt:new Date().toISOString()}));return json({ok:true});
        }
      }
      if(url.pathname==='/wedding/songs' && request.method==='GET'){
        const entries=[];let cursor;
        do {
          const page=await env.SUBSCRIBERS.list({prefix:'wedding:song:',cursor,limit:100});
          for(const key of page.keys){
            const item=await env.SUBSCRIBERS.get(key.name,'json');
            if(item && item.type==='song')entries.push({name:item.name,message:item.message,artist:item.artist,createdAt:item.createdAt});
          }
          cursor=page.list_complete?undefined:page.cursor;
        } while(cursor && entries.length<500);
        return json({songs:entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,500)});
      }
      if(url.pathname==='/wedding/wishes' && request.method==='GET'){
        const out=[];let cursor;
        do{const page=await env.SUBSCRIBERS.list({prefix:'wedding:wish:',cursor,limit:100});for(const k of page.keys){const item=await env.SUBSCRIBERS.get(k.name,'json');if(item?.approved)out.push({name:item.name,message:item.message,createdAt:item.createdAt})}cursor=page.list_complete?undefined:page.cursor}while(cursor&&out.length<200);
        return json({wishes:out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)});
      }
      // Wedding dashboard management is intentionally public at the couple's request.
      // Anyone can edit or delete wedding content. Other admin endpoints remain protected.
      if(url.pathname==='/wedding/admin/list' && request.method==='GET'){
        const type=url.searchParams.get('type');if(!['song','wish'].includes(type))return json({error:'Invalid type'},400);
        let cursor;const entries=[];do{const page=await env.SUBSCRIBERS.list({prefix:'wedding:'+type+':',cursor,limit:100});for(const k of page.keys){const item=await env.SUBSCRIBERS.get(k.name,'json');if(item)entries.push(item)}cursor=page.list_complete?undefined:page.cursor}while(cursor&&entries.length<500);
        return json({entries:entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
      }
      if(url.pathname==='/wedding/admin/update' && request.method==='POST'){
        const data=await request.json().catch(()=>null);
        if(!data || typeof data.id!=='string'||!/^wedding:(song|wish):/.test(data.id))return json({error:'Invalid ID'},400);
        const old=await env.SUBSCRIBERS.get(data.id,'json');if(!old)return json({error:'Not found'},404);
        if(data.action==='delete')await env.SUBSCRIBERS.delete(data.id);
        else if(data.action==='approve'||data.action==='hide'){old.approved=data.action==='approve';await env.SUBSCRIBERS.put(data.id,JSON.stringify(old))}
        else if(data.action==='edit'){
          const name=String(data.name||'').trim().slice(0,80);
          const message=String(data.message||'').trim().slice(0,500);
          const artist=old.type==='song'?String(data.artist||'').trim().slice(0,100):'';
          if(!name||!message||(old.type==='song'&&!artist))return json({error:'Required fields missing'},400);
          old.name=name;old.message=message;old.artist=artist;
          await env.SUBSCRIBERS.put(data.id,JSON.stringify(old));
        }
        else return json({error:'Invalid action'},400);
        return json({ok:true});
      }
      if(url.pathname==='/photos/delete' && request.method==='POST'){
        const data=await request.json().catch(()=>null);
        if(!data||typeof data.id!=='string'||!/^guest-uploads\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[a-f0-9-]+\.(jpg|png|webp|heic|heif)$/i.test(data.id))return json({error:'Invalid photo'},400);
        await env.PHOTOS.delete(data.id);return json({ok:true});
      }
      return json({error:'Not found'},404);
    }
    if (url.pathname === '/photos/list' && request.method === 'GET') {
      const headers={'Access-Control-Allow-Origin':'https://evroscchristodoulou.github.io','Cache-Control':'no-store'};
      if (!env.PHOTOS) return Response.json({error:'Gallery unavailable'},{status:503,headers});
      const cursor=url.searchParams.get('cursor')||undefined;
      try {
        const page=await env.PHOTOS.list({prefix:'guest-uploads/',limit:60,cursor});
        const photos=page.objects.filter(obj=>/\.(jpg|png|webp|heic|heif)$/i.test(obj.key)).map(obj=>({id:obj.key,date:obj.uploaded?.toISOString()||null}));
        return Response.json({photos,cursor:page.truncated?page.cursor:null},{headers});
      } catch(e) {return Response.json({error:'Could not load gallery'},{status:500,headers});}
    }
    if (url.pathname === '/photos/view' && request.method === 'GET') {
      if (!env.PHOTOS) return new Response('Unavailable',{status:503});
      const key=url.searchParams.get('id')||'';
      if (!/^guest-uploads\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[a-f0-9-]+\.(jpg|png|webp|heic|heif)$/i.test(key)) return new Response('Invalid photo',{status:400});
      const obj=await env.PHOTOS.get(key);
      if (!obj) return new Response('Not found',{status:404});
      return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'https://evroscchristodoulou.github.io'}});
    }
    if (url.pathname === '/photos/upload') {
      const headers = {'Access-Control-Allow-Origin':'https://evroscchristodoulou.github.io','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
      if (request.method !== 'POST') return new Response('Method not allowed',{status:405,headers});
      if (request.headers.get('Origin') !== 'https://evroscchristodoulou.github.io') return new Response('Forbidden',{status:403,headers});
      if (!env.PHOTOS) return Response.json({error:'Photo uploads are not configured yet'},{status:503,headers});
      const contentType=(request.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
      const allowed=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
      if (!allowed.includes(contentType)) return Response.json({error:'Unsupported photo format'},{status:415,headers});
      const max=10*1024*1024;
      const declared=Number(request.headers.get('Content-Length')||0);
      if (declared>max) return Response.json({error:'Photo exceeds 10 MB'},{status:413,headers});
      const bytes=await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength>max) return Response.json({error:'Photo must be between 1 byte and 10 MB'},{status:413,headers});
      const b=new Uint8Array(bytes);let valid=false;
      if(contentType==='image/jpeg') valid=b[0]===255&&b[1]===216&&b[2]===255;
      if(contentType==='image/png') valid=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;
      if(contentType==='image/webp') valid=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
      if(contentType==='image/heic'||contentType==='image/heif') valid=String.fromCharCode(...b.slice(4,8))==='ftyp';
      if(!valid) return Response.json({error:'Invalid image file'},{status:415,headers});
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'}[contentType];
      const key='guest-uploads/'+new Date().toISOString().slice(0,10)+'/'+crypto.randomUUID()+'.'+ext;
      await env.PHOTOS.put(key,bytes,{httpMetadata:{contentType},customMetadata:{source:'wedding-guest-upload'}});
      return Response.json({ok:true},{status:201,headers});
    }
    if (url.pathname === '/health') return Response.json({ok:true, service:'wedding-telegram'});
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('Forbidden',{status:403});
      const update = await request.json();
      const msg = update.message;
      if (!msg?.chat || msg.chat.type !== 'private' || !msg.text) return new Response('OK');
      const id = String(msg.chat.id);
      const command = msg.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
      if (command === '/start') {
        await env.SUBSCRIBERS.put(id, JSON.stringify({joinedAt:new Date().toISOString()}));
        await send(env,id,'❤️ Welcome to Evros & Maria wedding updates!\n\n10 June 2028 · Barnyard Venue, Skarinou\n\nYou are subscribed. /stop to unsubscribe.\n\nΚαλώς ήρθατε στις ενημερώσεις του γάμου μας! Για διαγραφή: /stop');
      } else if (command === '/stop') {
        await env.SUBSCRIBERS.delete(id);
        await send(env,id,'You have unsubscribed. /start to join again.\nΗ εγγραφή σας ακυρώθηκε. /start για επανεγγραφή.');
      } else if (command === '/help') {
        await send(env,id,'/start — Subscribe / Εγγραφή\n/stop — Unsubscribe / Διαγραφή\nWedding website: https://evroscchristodoulou.github.io/evros-maria-wedding/');
      }
      return new Response('OK');
    }
    if (url.pathname === '/admin/send' && request.method === 'POST') {
      const provided=request.headers.get('Authorization')||'';
      if (!env.ADMIN_SECRET || provided !== 'Bearer '+env.ADMIN_SECRET) return new Response('Unauthorized',{status:401});
      const {message} = await request.json();
      if (typeof message !== 'string' || !message.trim() || message.length > 3500) return new Response('Invalid message',{status:400});
      let cursor, delivered=0, failed=0;
      do {
        const page=await env.SUBSCRIBERS.list({cursor,limit:100});
        for(const key of page.keys){
          if(!/^\\d+$/.test(key.name))continue;
          const result=await send(env,key.name,message.trim());
          if(result.ok) delivered++;
          else { failed++; if(result.status===403) await env.SUBSCRIBERS.delete(key.name); }
        }
        cursor=page.list_complete?undefined:page.cursor;
      } while(cursor);
      return Response.json({delivered,failed});
    }
    return new Response('Not found',{status:404});
  }
};
async function send(env,chat_id,text){
  const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id,text,disable_web_page_preview:true})
  });
  return {ok:r.ok,status:r.status};
}

