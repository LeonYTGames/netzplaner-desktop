(function(){
  const LS_SKIP = 'netzplaner.update.skip';
  const LS_REMIND = 'netzplaner.update.remindAt';
  const LS_ENABLED = 'netzplaner.update.enabled';
  function getEnabled(){ const v=localStorage.getItem(LS_ENABLED); return v===null?true:v==='true'; }
  function setEnabled(v){ localStorage.setItem(LS_ENABLED, v?'true':'false'); }
  function getSkipped(){ try{return JSON.parse(localStorage.getItem(LS_SKIP)||'{}');}catch{return {}} }
  function skipVersion(ver){ const s=getSkipped(); s[ver]=true; localStorage.setItem(LS_SKIP, JSON.stringify(s)); }
  function getRemindAt(){ const v=localStorage.getItem(LS_REMIND); return v?parseInt(v,10):0; }
  function remindLater(){ localStorage.setItem(LS_REMIND, String(Date.now()+24*60*60*1000)); }
  function normalize(v){ return String(v||'').replace(/^v/i,'').trim(); }
  async function checkForUpdates(){
    if(!getEnabled()) return;
    const remindAt=getRemindAt();
    if(remindAt && Date.now()<remindAt) return;
    try {
      const res = await fetch('https://api.github.com/repos/LeonYTGames/netzplaner-desktop/releases/latest', {headers:{'Accept':'application/vnd.github+json','User-Agent':'netzplaner-desktop'}});
      if(!res.ok) return;
      const data = await res.json();
      const tag = data.tag_name || data.name || '';
      if(!tag) return;
      const skipped = getSkipped();
      if(skipped[tag]) return;
      const current = (window.netzplaner && window.netzplaner.getVersion) ? await window.netzplaner.getVersion().catch(()=> '') : '';
      if(current && normalize(tag) === normalize(current)) return;
      showUpdateDialog({tag, url: data.html_url || (data.assets && data.assets[0] && data.assets[0].browser_download_url) || 'https://github.com/LeonYTGames/netzplaner-desktop/releases/latest', body: data.body || ''});
    }catch(e){}
  }
  function showUpdateDialog(info){
    const dlg=document.createElement('div');
    dlg.className='dialog open';
    dlg.innerHTML=`<div class="modal" style="width:min(520px,92vw)"><h2>Update available</h2><p>A new version <strong>${escapeHtml(info.tag)}</strong> is available on GitHub.</p><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" id="updSkip">Skip this version</button><button class="btn" id="updLater">Remind me later</button><button class="btn accent" id="updOpen">Download</button></div></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#updSkip').onclick=()=>{ skipVersion(info.tag); dlg.remove(); };
    dlg.querySelector('#updLater').onclick=()=>{ remindLater(); dlg.remove(); };
    dlg.querySelector('#updOpen').onclick=async ()=>{
      try {
        if(window.netzplaner?.openExternal){
          await window.netzplaner.openExternal(info.url);
        }else{
          window.open(info.url,'_blank');
        }
      }catch(e){
        try{ window.open(info.url,'_blank'); }catch{}
      }
      dlg.remove();
    };
  }
  function escapeHtml(v){ return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
  window.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(checkForUpdates, 1500);
    // settings
    const settingsBtn=document.createElement('button');
    settingsBtn.className='btn';
    settingsBtn.id='settingsBtn';
    settingsBtn.textContent='Settings';
    const spacer=document.querySelector('.topbar .spacer');
    if(spacer) spacer.parentNode.insertBefore(settingsBtn, spacer);
    settingsBtn.onclick=()=>{
      const dlg=document.createElement('div');
      dlg.className='dialog open';
      dlg.innerHTML=`<div class="modal" style="width:min(420px,92vw)"><h2>Settings</h2><label class="checkrow" style="margin:10px 0"><input id="updToggle" type="checkbox" ${getEnabled()?'checked':''}> Enable automatic update checks</label><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="updClose">Close</button></div></div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('#updToggle').onchange=(e)=>{ setEnabled(e.target.checked); };
      dlg.querySelector('#updClose').onclick=()=>dlg.remove();
    };
  });
})();
