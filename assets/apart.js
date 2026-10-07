(() => {
  'use strict';
  const syncViewport = () => {
    const viewport=window.visualViewport;
    document.documentElement.style.setProperty('--ab-viewport-height',(viewport?.height || window.innerHeight)+'px');
    document.documentElement.style.setProperty('--ab-viewport-top',(viewport?.offsetTop || 0)+'px');
  };
  syncViewport();
  window.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
  const quickMode = new URLSearchParams(location.search).get('apart-quick') === '1' && window.parent !== window;
  if (quickMode) {
    document.documentElement.classList.add('ab-quick-mode');
    document.querySelectorAll('a[href]').forEach(a => { a.target = '_top'; });
    const description=document.querySelector('[data-ab-product-description]');
    if(description){description.hidden=true;const toggle=document.createElement('button');toggle.type='button';toggle.className='ab-button ab-description-toggle';toggle.textContent='Read product details';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',description.id);description.before(toggle);toggle.addEventListener('click',()=>{description.hidden=!description.hidden;toggle.setAttribute('aria-expanded',String(!description.hidden));toggle.textContent=description.hidden?'Read product details':'Hide product details';});}
    const notify = () => parent.postMessage({type:'apart-cart-changed'}, location.origin);
    document.addEventListener('click', () => { setTimeout(notify, 100); setTimeout(notify, 700); });
    document.addEventListener('keydown', e => {
      if(e.key==='Escape'){e.preventDefault();parent.postMessage({type:'apart-close-product'},location.origin);}
      if(e.key==='Tab'){
        const nodes=[...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
        if((e.shiftKey&&document.activeElement===nodes[0])||(!e.shiftKey&&document.activeElement===nodes.at(-1))){e.preventDefault();parent.postMessage({type:'apart-focus-product-close'},location.origin);}
      }
    });
  }
  let focusReturn = null, originalOverflow = '';
  function openDialog(dialog, trigger) {
    if (!dialog || dialog.open) return;
    const existing = document.querySelector('dialog[open]');
    if (existing) existing.close();
    focusReturn = trigger || document.activeElement;
    if(document.body.style.overflow !== 'hidden') originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    syncViewport();
    dialog.showModal();
    dialog.querySelector('[data-ab-close]')?.focus({preventScroll:true});
  }
  function bindDialog(dialog) {
    if (dialog.dataset.abBound) return;
    dialog.dataset.abBound = 'true';
    dialog.addEventListener('keydown', e => {
      if(e.key!=='Tab')return;
      const nodes=[...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    });
    dialog.addEventListener('click', e => { if(e.target === dialog) {const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close();} });
    dialog.addEventListener('close', () => {
      const anotherOpen=document.querySelector('dialog[open]') || window.alpineApp?.appCustomer.modalIsOpen;
      document.body.style.overflow = anotherOpen ? 'hidden' : originalOverflow;
      if (!anotherOpen && focusReturn?.isConnected) focusReturn.focus({preventScroll:true});
      if(dialog.classList.contains('ab-quick-dialog')) dialog.querySelector('iframe')?.remove();
    });
  }
  document.querySelectorAll('dialog').forEach(bindDialog);
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-ab-close]');
    if(close){close.closest('dialog')?.close();return;}
    const menu = e.target.closest('[data-ab-menu-open]');
    if(menu){openDialog(document.querySelector('[data-ab-menu]'),menu);return;}
    const dialogTrigger=e.target.closest('[data-ab-dialog-open]');
    if(dialogTrigger){const dialog=document.getElementById(dialogTrigger.dataset.abDialogOpen);if(dialog){bindDialog(dialog);openDialog(dialog,dialogTrigger.closest('dialog') ? document.querySelector('[data-ab-menu-open]') : dialogTrigger);}return;}
    const group = e.target.closest('[data-ab-group]');
    if(group){e.preventDefault();const d=document.getElementById(group.dataset.abGroup);bindDialog(d);openDialog(d,group);return;}
    const product = e.target.closest('[data-ab-product]');
    if(product && !e.ctrlKey && !e.metaKey && !e.shiftKey){
      const target = new URL(product.href,location.href);
      if(target.origin !== location.origin) return;
      e.preventDefault();
      const existing = product.closest('dialog');
      const returnTo = existing ? document.querySelector('[data-ab-group="'+existing.id+'"]') : product;
      if(existing) existing.close();
      let dialog=document.querySelector('.ab-quick-dialog');
      if(!dialog){dialog=document.createElement('dialog');dialog.className='ab-quick-dialog';dialog.setAttribute('aria-label','Product details');dialog.innerHTML='<div class="ab-dialog-top"><strong>Product details</strong><a data-ab-full-product target="_top">Open full details ↗</a><button class="ab-button" data-ab-close type="button" aria-label="Close product details">✕</button></div>';document.getElementById('app').append(dialog);bindDialog(dialog);}
      dialog.querySelector('[data-ab-full-product]').href=target.href;
      target.searchParams.set('apart-quick','1');
      const frame=document.createElement('iframe');frame.title='Product details and purchase options';dialog.setAttribute('aria-busy','true');frame.addEventListener('load',()=>dialog.removeAttribute('aria-busy'),{once:true});frame.src=target.href;dialog.append(frame);openDialog(dialog,returnTo);
    }
    if(e.target.closest('.ab-drawer nav a')) document.querySelector('[data-ab-menu]')?.close();
  });
  window.addEventListener('message', e => {
    if(e.origin!==location.origin) return;
    const frame=document.querySelector('.ab-quick-dialog iframe');
    if(!frame || e.source!==frame.contentWindow)return;
    if(e.data?.type==='apart-cart-changed')window.alpineApp?.appCart.init();
    if(e.data?.type==='apart-close-product')frame.closest('dialog').close();
    if(e.data?.type==='apart-focus-product-close')frame.closest('dialog').querySelector('[data-ab-close]').focus();
  });
  function initializeSurfaces() {
  document.querySelectorAll('dialog').forEach(bindDialog);
  document.querySelectorAll('[data-ab-catalog]').forEach(catalog => {
    if(catalog.dataset.abReady)return;catalog.dataset.abReady='true';
    const grid=catalog.querySelector('[data-ab-grid]'), items=[...grid.querySelectorAll('[data-ab-item]')];
    let filter='all';
    const search=catalog.querySelector('[data-ab-search]'), sort=catalog.querySelector('[data-ab-sort]');
    const update=()=>{
      const term=(search?.value||'').trim().toLowerCase();
      let count=0;
      items.forEach(item=>{const visible=(filter==='all'||item.dataset.group===filter)&&item.dataset.name.toLowerCase().includes(term);item.hidden=!visible;if(visible)count++;});
      const mode=sort?.value;
      const price=item=>window.alpineApp?.appCurrency.convert(Number(item.dataset.price),item.dataset.currency)||Number(item.dataset.price);
      [...items].sort((a,b)=>mode==='az'?a.dataset.title.localeCompare(b.dataset.title):mode==='low'?price(a)-price(b):mode==='high'?price(b)-price(a):Number(a.dataset.index)-Number(b.dataset.index)).forEach(item=>grid.append(item));
      catalog.querySelector('[data-ab-count]').textContent=count+' '+(count===1?'collection / product':'collections / products');
      catalog.querySelector('[data-ab-empty]').hidden=count>0;
    };
    search?.addEventListener('input',update);sort?.addEventListener('change',update);
    catalog.querySelectorAll('[data-ab-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.abFilter;catalog.querySelectorAll('[data-ab-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));update();}));
    catalog.querySelector('[data-ab-reset]')?.addEventListener('click',()=>{if(search)search.value='';filter='all';catalog.querySelectorAll('[data-ab-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.abFilter==='all')));update();});
    update();
  });
  document.querySelectorAll('[data-ab-status]').forEach(section=>{
    if(section.dataset.abReady)return;section.dataset.abReady='true';
    const update=()=>{const term=(section.querySelector('input')?.value||'').toLowerCase();let count=0;section.querySelectorAll('[data-ab-status-row]').forEach(row=>{row.hidden=!row.dataset.name.toLowerCase().includes(term);if(!row.hidden)count++;});section.querySelectorAll('.ab-status-group').forEach(group=>{group.hidden=![...group.querySelectorAll('[data-ab-status-row]')].some(row=>!row.hidden);});section.querySelector('[data-ab-status-empty]').hidden=count>0;};section.querySelector('input')?.addEventListener('input',update);update();
  });
  document.querySelectorAll('[data-ab-review-sort]').forEach(select=>{
    if(select.dataset.abReady)return;select.dataset.abReady='true';
    const params=new URLSearchParams(location.search), current=(params.get('orderColumn')||'created_at')+'_'+(params.get('orderDirection')||'desc');
    if([...select.options].some(o=>o.value===current))select.value=current;
    select.addEventListener('change',()=>{const parts=select.value.split('_'), direction=parts.pop(), url=new URL(location.href);url.searchParams.set('orderColumn',parts.join('_'));url.searchParams.set('orderDirection',direction);url.searchParams.delete('page');location.assign(url);});
  });
  }
  initializeSurfaces();
  document.addEventListener('apart:refresh',initializeSurfaces);
  document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){e.target.style.visibility='hidden';}},true);
})();