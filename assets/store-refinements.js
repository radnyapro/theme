(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function init(){
    document.querySelectorAll('.pw-sort').forEach(sort=>{
      if(sort.dataset.ready)return;sort.dataset.ready='true';
      const summary=sort.querySelector('summary');
      sort.querySelectorAll('[data-pw-sort]').forEach(button=>button.addEventListener('click',()=>{
        const input=sort.querySelector('[data-ab-sort]');input.value=button.dataset.pwSort;input.dispatchEvent(new Event('change',{bubbles:true}));
        sort.querySelector('[data-pw-sort-label]').textContent=button.childNodes[0].textContent.trim();
        sort.querySelectorAll('[data-pw-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));sort.open=false;summary.focus();
      }));
      sort.addEventListener('keydown',e=>{if(e.key==='Escape'){sort.open=false;summary.focus();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();sort.open=true;const buttons=[...sort.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
      sort.addEventListener('focusout',()=>setTimeout(()=>{if(!sort.contains(document.activeElement))sort.open=false;},0));
    });
    const reviewParams=new URLSearchParams(location.search),reviewOrder=(reviewParams.get('orderColumn')||'created_at')+'_'+(reviewParams.get('orderDirection')||'desc');
    document.querySelectorAll('[data-pw-review-sort]').forEach(link=>{if(link.dataset.pwReviewSort===reviewOrder)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
    document.querySelectorAll('[data-pw-comparison]').forEach(frame=>{
      if(frame.dataset.ready)return;frame.dataset.ready='true';const input=frame.querySelector('input');
      const update=()=>{const value=Math.max(0,Math.min(100,Number(input.value)||0));frame.style.setProperty('--pw-split',value+'%');input.setAttribute('aria-valuetext',value+'% before image');};input.addEventListener('input',update);update();
    });
    document.querySelectorAll('.ab-currency-dialog').forEach(dialog=>{
      if(dialog.dataset.currencyReady)return;dialog.dataset.currencyReady='true';
      let names;try{names=new Intl.DisplayNames(['en'],{type:'currency'});}catch{}
      const options=[...dialog.querySelectorAll('[data-ab-currency-option]')];
      for(const option of options){const code=option.dataset.abCurrencyOption.toUpperCase();let name=code;try{name=names?.of(code)||code;}catch{}option.querySelector('[data-ab-currency-name]').textContent=name;option.dataset.search=(code+' '+name).toLowerCase();}
      const popular=['USD','EUR','GBP','CAD','AUD'];
      options.sort((a,b)=>{const rank=x=>{const i=popular.indexOf(x.dataset.abCurrencyOption.toUpperCase());return i<0?99:i;};return rank(a)-rank(b)||a.dataset.abCurrencyOption.localeCompare(b.dataset.abCurrencyOption);}).forEach(option=>dialog.querySelector('.ab-currency-options').append(option));
      dialog.querySelector('[data-ab-currency-search]').addEventListener('input',e=>{const term=e.target.value.trim().toLowerCase();let count=0;options.forEach(option=>{option.hidden=!option.dataset.search.includes(term);if(!option.hidden)count++;});dialog.querySelector('[data-ab-currency-empty]').hidden=count>0;});
    });
    document.querySelectorAll('[data-ab-rail]').forEach(rail=>{
      if(rail.dataset.railReady)return;rail.dataset.railReady='true';
      const track=rail.querySelector('.ab-rail-track'),seen=new Set();
      track.querySelectorAll('[data-product-id]').forEach(item=>{if(seen.has(item.dataset.productId))item.remove();else seen.add(item.dataset.productId);});
      let paused=rail.dataset.autoplay==='false',interacting=false;
      const advance=dir=>{const max=track.scrollWidth-track.clientWidth;if(max<2)return;const step=(track.firstElementChild?.getBoundingClientRect().width||240)+parseFloat(getComputedStyle(track).gap||16);const atEnd=track.scrollLeft>=max-3,atStart=track.scrollLeft<=3;track.scrollTo({left:dir>0?(atEnd?0:Math.min(max,track.scrollLeft+step)):(atStart?max:Math.max(0,track.scrollLeft-step)),behavior:reduced.matches?'instant':'smooth'});};
      rail.querySelector('[data-ab-rail-next]').addEventListener('click',()=>advance(1));
      rail.querySelector('[data-ab-rail-prev]').addEventListener('click',()=>advance(-1));
      rail.addEventListener('pointerenter',()=>interacting=true);rail.addEventListener('pointerleave',()=>interacting=false);
      track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();advance(e.key==='ArrowRight'?1:-1);}});
      const interval=Math.max(3,Number(rail.dataset.interval)||5)*1000;
      const timer=setInterval(()=>{if(!rail.isConnected){clearInterval(timer);return;}if(paused||reduced.matches||interacting||document.hidden||rail.contains(document.activeElement))return;const rect=rail.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)advance(1);},interval);
    });
  }
  init();document.addEventListener('apart:refresh',init);
  document.addEventListener('click',e=>document.querySelectorAll('.pw-sort[open]').forEach(sort=>{if(!sort.contains(e.target))sort.open=false;}));
})();