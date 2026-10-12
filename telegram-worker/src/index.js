export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
