export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
