/* Shared one-click return link on wedding management pages.
   Standalone public guest pages remain unchanged. */
(()=>{
  'use strict';
  const basename=location.pathname.split('/').pop().toLowerCase();
  if(basename==='planning-centre.html'||basename==='index.html')return;
  if((basename==='announcements.html'||basename==='wedding-predictions.html')
      &&!new URLSearchParams(location.search).has('manage'))return;
  if(document.querySelector('.em-return-to-planning'))return;

  const css=document.createElement('style');
  css.textContent=`
  .em-return-to-planning{
    position:fixed;z-index:950;
    left:clamp(10px,2vw,20px);
    bottom:calc(16px + env(safe-area-inset-bottom,0px));
    display:inline-flex;align-items:center;justify-content:center;gap:9px;
    min-height:46px;max-width:calc(100vw - 24px);
    padding:11px 17px;
    background:#292622;color:#fffdfa!important;border:1px solid #292622;
    border-radius:4px;box-shadow:0 8px 26px rgba(27,23,18,.25);
    text-decoration:none!important;font:500 12px/1.4 Inter,Arial,sans-serif;
    letter-spacing:.01em;cursor:pointer;white-space:nowrap;
    transition:background .2s,box-shadow .2s,transform .2s
  }
  .em-return-to-planning:hover,.em-return-to-planning:focus-visible{
    background:#534638;border-color:#534638;color:#fffdfa!important;
    box-shadow:0 11px 29px rgba(27,23,18,.3);transform:translateY(-2px);
  }
  .em-return-to-planning:focus-visible{outline:2px solid #b99f7c;outline-offset:3px}
  .em-return-to-planning-icon{font-size:18px;line-height:1;flex-shrink:0}
  body{padding-bottom:max(62px,env(safe-area-inset-bottom,0px))}
  @media(max-width:550px){
    .em-return-to-planning{left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));
      padding:10px 14px;min-height:44px;font-size:11px}
  }
  @media(prefers-reduced-motion:reduce){.em-return-to-planning{transition:none}
    .em-return-to-planning:hover{transform:none}}
  `;
  document.head.append(css);

  const link=document.createElement('a');
  link.className='em-return-to-planning';
  link.href='./planning-centre.html';
  link.setAttribute('aria-label','Back to Planning Centre');
  const arrow=document.createElement('span');
  arrow.className='em-return-to-planning-icon';
  arrow.setAttribute('aria-hidden','true');
  arrow.textContent='←';
  const label=document.createElement('span');
  link.append(arrow,label);
  document.body.append(link);

  function translate(){
    const greek=localStorage.getItem('wedding-lang')==='el';
    label.textContent=greek?'Κέντρο Οργάνωσης':'Planning Centre';
    link.setAttribute('aria-label',greek?'Πίσω στο Κέντρο Οργάνωσης':'Back to Planning Centre');
    link.title=greek?'Πίσω στο Κέντρο Οργάνωσης':'Back to Planning Centre';
  }
  translate();
  document.getElementById('language')?.addEventListener('click',()=>setTimeout(translate,0));
  window.addEventListener('storage',event=>{if(event.key==='wedding-lang')translate()});
})();