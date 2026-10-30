/* Independent of React so diagnostics survive rendering and startup failures. */
(() => {
  if (window.pinefallDiagnostics) return;
  const entries = [];
  let collapsed = false;
  const host = document.createElement('div');
  host.id = 'pinefall-diagnostics';
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host{position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px/1.5 system-ui,sans-serif;color:#f5e9e4;max-width:calc(100vw - 32px)}
    *{box-sizing:border-box}section{width:620px;max-width:calc(100vw - 32px);background:#241f25;border:1px solid #cf7568;border-radius:9px;box-shadow:0 12px 60px #0008;overflow:hidden}header{display:flex;align-items:center;gap:8px;padding:12px 15px;background:#39272e;flex-wrap:wrap}strong{flex:1}button{font:inherit;color:#f5e9e4;background:#ffffff0b;border:1px solid #ffffff30;border-radius:4px;padding:5px 10px;cursor:pointer}button:hover{background:#ffffff20}button:focus-visible{outline:2px solid #f0c38b}main{max-height:45vh;overflow:auto;padding:0 15px}article{border-bottom:1px solid #ffffff20;padding:13px 0}small{color:#e4a491}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,monospace;margin:8px 0;color:#f4ded8}footer{padding:10px 15px;font-size:11px;color:#bda9b2}summary{cursor:pointer;color:#d8b6ab}details pre{color:#c5b5bf}.badge{background:#39272e;border-color:#cf7568}
    [hidden]{display:none!important}
  </style><section role="region" aria-label="Application errors" hidden><header><strong aria-live="polite"></strong><button data-action="copy">Copy</button><button data-action="clear">Clear</button><button data-action="reload">Reload</button><button data-action="collapse" aria-label="Minimize error panel">−</button></header><main></main><footer>Browser-side errors only. Clearing the log does not repair a crashed game.</footer></section><button class="badge" hidden></button>`;
  const panel=shadow.querySelector('section'), title=shadow.querySelector('strong'), list=shadow.querySelector('main'), badge=shadow.querySelector('.badge');
  function format(value) {
    try {
      if(value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
      if(typeof value==='string') return value;
      const seen=new WeakSet();
      return JSON.stringify(value,(_,v)=>{if(typeof v==='bigint')return String(v);if(v&&typeof v==='object'){if(seen.has(v))return '[Circular]';seen.add(v)}return v},2) ?? String(value);
    } catch { return '[Unable to format error]'; }
  }
  function render(){
    panel.hidden=!entries.length||collapsed;
    badge.hidden=!entries.length||!collapsed;
    title.textContent=`⚠ Pinefall errors (${entries.length})`;
    badge.textContent=`⚠ ${entries.length} error${entries.length===1?'':'s'} — view details`;
    list.replaceChildren();
    entries.slice().reverse().forEach(e=>{
      const article=document.createElement('article'),meta=document.createElement('small'),message=document.createElement('pre');
      meta.textContent=`${e.time} · ${e.source}${e.count>1?` · repeated ${e.count}×`:''}`;
      message.textContent=e.message;
      article.append(meta,message);
      if(e.details){const details=document.createElement('details'),summary=document.createElement('summary'),stack=document.createElement('pre');summary.textContent='Component stack';stack.textContent=e.details;details.append(summary,stack);article.append(details)}
      list.append(article);
    });
  }
  function report(source,message,details=''){
    const text=format(message).slice(0,24000);
    const last=entries[entries.length-1];
    if(last&&last.source===source&&last.message===text){last.count++;render();return;}
    entries.push({source,message:text,details:String(details).slice(0,16000),time:new Date().toLocaleTimeString(),count:1});
    if(entries.length>50)entries.shift();
    collapsed=false;render();
  }
  window.pinefallDiagnostics={report,clear(){entries.length=0;render()}};
  const original=console.error;
  console.error=function(...args){original.apply(console,args);report('console.error',args.map(format).join(' '))};
  window.addEventListener('error',event=>{
    if(event.error)report('Uncaught exception',event.error);
    else if(event.message)report('JavaScript error',`${event.message}\n${event.filename||''}:${event.lineno||0}:${event.colno||0}`);
    else if(event.target?.tagName==='SCRIPT')report('Script failed to load',event.target.src||'Unknown script');
  },true);
  window.addEventListener('unhandledrejection',event=>report('Unhandled promise rejection',event.reason));
  host.addEventListener('keydown',e=>e.stopPropagation());
  host.addEventListener('keyup',e=>e.stopPropagation());
  badge.onclick=()=>{collapsed=false;render()};
  shadow.querySelector('[data-action="collapse"]').onclick=()=>{collapsed=true;render()};
  shadow.querySelector('[data-action="clear"]').onclick=()=>window.pinefallDiagnostics.clear();
  shadow.querySelector('[data-action="reload"]').onclick=()=>location.reload();
  shadow.querySelector('[data-action="copy"]').onclick=async event=>{
    const button=event.currentTarget;
    try{await navigator.clipboard.writeText(entries.map(e=>`${e.time} | ${e.source}\n${e.message}\n${e.details}`).join('\n\n'));button.textContent='Copied';}
    catch{button.textContent='Copy unavailable';}
    setTimeout(()=>button.textContent='Copy',2000);
  };
})();
