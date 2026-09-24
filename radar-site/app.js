if (location.protocol === 'http:' && location.hostname !== 'localhost') {
  location.replace('https://' + location.host + location.pathname + location.search + location.hash);
}

(function(){
  const app = document.getElementById('app');
  const stamp = document.getElementById('stamp');
  const editBtn = document.getElementById('editSel');
  const sheetRoot = document.getElementById('sheetRoot');

  const S = {
    db:null, companies:[], articles:[], status:null,
    selection:null, selLoaded:false, draft:null, mode:'feed',
    company:null, signal:'all', open:null, storeNote:''
  };
  const LS_KEY = 'radar-selection-v1';
  const SIG = {
    optimiste:{cls:'pos', label:'Optimiste', verdict:'Signal optimiste'},
    neutre:{cls:'neu', label:'Neutre', verdict:'Signal neutre'},
    prudent:{cls:'neg', label:'Prudent', verdict:'Signal prudent'}
  };

  function el(tag, attrs, ...kids){
    const n = document.createElement(tag);
    if(attrs) for(const k in attrs){
      const v = attrs[k];
      if(v==null || v===false) continue;
      if(k==='class') n.className = v;
      else if(k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if(k==='text') n.textContent = v;
      else n.setAttribute(k, v===true?'':v);
    }
    for(const k of kids.flat()){ if(k==null||k===false) continue; n.append(k.nodeType?k:document.createTextNode(String(k))); }
    return n;
  }
  function svg(path, size){
    const s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none'); s.setAttribute('stroke','currentColor');
    s.setAttribute('stroke-width','2.4'); s.setAttribute('stroke-linecap','round'); s.setAttribute('stroke-linejoin','round');
    if(size){s.setAttribute('width',size);s.setAttribute('height',size);}
    s.innerHTML = path; return s;
  }
  const ICON_CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
  const ICON_LOCK = '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
  const ICON_X = '<path d="M6 6l12 12M18 6L6 18"/>';
  const ICON_OUT = '<path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>';

  const MONTHS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  function fmtDate(a){
    if(a.dateLabel) return a.dateLabel;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.date||'');
    if(!m) return a.date||'';
    return (+m[3]) + ' ' + MONTHS[+m[2]-1] + ' ' + m[1];
  }
  function safeUrl(u){
    try{ const x = new URL(u, location.href); return (x.protocol==='https:'||x.protocol==='http:') ? x.href : null; }catch(e){ return null; }
  }
  function isNew(a){
    if(!a.addedAt) return false;
    const t = Date.parse(a.addedAt); if(isNaN(t)) return false;
    return (Date.now()-t) < 36*3600*1000;
  }
  function coById(id){ return S.companies.find(c=>c.id===id); }
  function counts(list){
    const c={optimiste:0,neutre:0,prudent:0}; list.forEach(a=>{ if(c[a.signal]!=null) c[a.signal]++; }); return c;
  }
  function balanceBar(c, cls){
    const tot = c.optimiste+c.neutre+c.prudent || 1;
    return el('span',{class:cls||'balance','aria-hidden':'true'},
      el('span',{class:'b-pos',style:'width:'+(c.optimiste/tot*100)+'%'}),
      el('span',{class:'b-neu',style:'width:'+(c.neutre/tot*100)+'%'}),
      el('span',{class:'b-neg',style:'width:'+(c.prudent/tot*100)+'%'}));
  }

  /* ---------- selection storage ---------- */
  function lsGet(){ try{ const v = localStorage.getItem(LS_KEY); return v?JSON.parse(v):null; }catch(e){ return null; } }
  function lsSet(v){ try{ localStorage.setItem(LS_KEY, JSON.stringify(v)); }catch(e){} }
  function saveSelection(ids){
    S.selection = ids.slice(); lsSet(ids); render();
  }

  /* ---------- render ---------- */
  function render(){
    if(!S.companies.length){
      app.replaceChildren(el('div',{class:'loading'}, S.db===false ? 'La veille n\'a pas pu se charger. Rechargez la page dans un instant.' : 'Chargement de la veille…'));
      return;
    }
    const st = S.status && S.status.lastRun;
    stamp.textContent = st ? 'Dernière mise à jour : ' + new Date(st).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : S.articles.length + ' articles';
    if(!S.selLoaded) { app.replaceChildren(el('div',{class:'loading'},'Chargement de votre sélection…')); return; }
    const needOnb = S.mode==='pick' || !S.selection || !S.selection.length;
    editBtn.hidden = needOnb;
    if(needOnb) renderPick(); else renderFeed();
    renderSheet();
  }

  function renderPick(){
    if(!S.draft) S.draft = new Set(S.selection||[]);
    const first = !S.selection || !S.selection.length;
    const cos = S.companies.slice().sort((a,b)=>(a.order||99)-(b.order||99));
    const grid = el('div',{class:'pick-grid'}, cos.map(c=>{
      const n = S.articles.filter(a=>a.companyId===c.id).length;
      const on = S.draft.has(c.id);
      return el('button',{class:'pick',type:'button','aria-pressed':String(on),onclick:()=>{ on?S.draft.delete(c.id):S.draft.add(c.id); render(); }},
        el('div',{class:'row'}, el('span',{class:'name'},c.name), el('span',{class:'check'},svg(ICON_CHECK))),
        el('span',{class:'sector'}, (c.sector||'') + ' · ' + n + (n>1?' articles':' article')),
        el('span',{class:'line'}, c.oneLiner||''));
    }));
    const all = cos.every(c=>S.draft.has(c.id));
    app.replaceChildren(el('section',{class:'onb'},
      el('h2',null, first ? 'Choisissez les sociétés à suivre' : 'Modifier les sociétés suivies'),
      el('p',{class:'lead'}, 'Chaque société cochée débloque sa page de veille et ajoute ses actualités à votre fil. Votre choix est mémorisé dans ce navigateur, sans compte ni cookie.'),
      grid,
      el('div',{class:'onb-bar'},
        el('div',{class:'left'},
          el('button',{class:'btn ghost',type:'button',onclick:()=>{ S.draft = all?new Set():new Set(cos.map(c=>c.id)); render(); }}, all?'Tout décocher':'Tout sélectionner'),
          !first ? el('button',{class:'btn ghost',type:'button',onclick:()=>{ S.draft=null; S.mode='feed'; render(); }},'Annuler') : null),
        el('button',{class:'btn primary',type:'button',disabled:S.draft.size===0,onclick:()=>{ const ids=[...S.draft]; S.draft=null; S.mode='feed'; if(S.company && !ids.includes(S.company)) S.company=null; saveSelection(ids); }},
          'Débloquer ma veille (' + S.draft.size + ')'))
    ));
  }

  function renderFeed(){
    const sel = new Set(S.selection);
    const cos = S.companies.slice().sort((a,b)=>(a.order||99)-(b.order||99));
    const followed = cos.filter(c=>sel.has(c.id));
    const locked = cos.filter(c=>!sel.has(c.id));
    const mine = S.articles.filter(a=>sel.has(a.companyId));

    const rail = el('aside',{class:'rail'},
      el('div',null, el('h3',null,'Mes sociétés'),
        el('div',{class:'co-list'},
          el('button',{class:'co',type:'button','aria-current':String(!S.company),onclick:()=>{S.company=null;render();}},
            el('span',{class:'n'},'Toutes'), el('span',{class:'c mono'}, String(mine.length))),
          followed.map(c=>{
            const arts = S.articles.filter(a=>a.companyId===c.id);
            return el('button',{class:'co',type:'button','aria-current':String(S.company===c.id),onclick:()=>{S.company=c.id;render();window.scrollTo({top:0,behavior:'smooth'});}},
              el('span',{class:'n'},c.name), balanceBar(counts(arts)));
          }))),
      el('div',null, el('h3',null,'Signal'),
        el('div',{class:'filters'},
          [['all','Tous',null],['optimiste','Optimiste','var(--pos)'],['neutre','Neutre','var(--neu)'],['prudent','Prudent','var(--neg)']].map(([k,l,col])=>
            el('button',{class:'chip',type:'button','aria-pressed':String(S.signal===k),onclick:()=>{S.signal=k;render();}},
              col?el('span',{class:'dot-s',style:'background:'+col}):null, l)))),
      locked.length ? el('div',null, el('h3',null,'Non suivies'),
        el('div',{class:'co-list'}, locked.map(c=>
          el('button',{class:'co locked',type:'button',title:'Ajouter à ma veille',onclick:()=>{ saveSelection([...S.selection, c.id]); S.company=c.id; }},
            el('span',{class:'n'},c.name), svg(ICON_LOCK))))) : null
    );

    let list = S.company ? mine.filter(a=>a.companyId===S.company) : mine;
    if(S.signal!=='all') list = list.filter(a=>a.signal===S.signal);
    list = list.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.addedAt||'').localeCompare(a.addedAt||''));

    const main = el('section',null);
    if(S.company){
      const c = coById(S.company);
      const arts = S.articles.filter(a=>a.companyId===c.id);
      const k = counts(arts); const tot = arts.length||1;
      const lean = k.optimiste>k.prudent*2 ? ['Dynamique favorable','pos'] : k.prudent>k.optimiste ? ['Points de vigilance','neg'] : ['Dynamique contrastée','neu'];
      main.append(el('div',{class:'cohero'},
        el('div',null,
          el('span',{class:'eyebrow'}, c.sector||''),
          el('h2',null,c.name),
          el('p',null,c.description||c.oneLiner||''),
          el('div',{class:'facts'},
            c.hq?el('span',null,'Siège ',el('b',null,c.hq)):null,
            c.founded?el('span',null,'Création ',el('b',null,c.founded)):null,
            c.leaders?el('span',null,'Dirigeants ',el('b',null,c.leaders)):null,
            safeUrl(c.website)?el('span',null,el('a',{href:safeUrl(c.website),target:'_blank',rel:'noopener noreferrer'},'Site officiel')):null)),
        el('div',{class:'mood'},
          el('span',{class:'eyebrow'},'Tonalité de la veille'),
          el('span',{class:'verdict',style:'color:var(--'+lean[1]+')'},lean[0]),
          balanceBar(k,'bar'),
          el('div',{class:'legend mono'},
            el('span',null,k.optimiste+' optimiste'+(k.optimiste>1?'s':'')),
            el('span',null,k.neutre+' neutre'+(k.neutre>1?'s':'')),
            el('span',null,k.prudent+' prudent'+(k.prudent>1?'s':''))))
      ));
    }
    main.append(el('div',{class:'feed-head'},
      el('h2',null, S.company ? 'Actualités' : 'Mon fil de veille'),
      el('span',{class:'count mono'}, list.length + (list.length>1?' articles':' article'))));
    if(!list.length){
      main.append(el('div',{class:'empty'}, S.signal!=='all' ? 'Aucun article avec ce signal pour le moment.' : 'Pas encore d\'actualité pour cette sélection. Le fil se complète à chaque mise à jour.'));
    } else {
      main.append(el('div',{class:'feed'}, list.map(a=>{
        const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
        return el('button',{class:'card '+s.cls,type:'button',onclick:()=>{S.open=a.id;renderSheet();}},
          el('span',{class:'stripe'}),
          el('div',null,
            el('div',{class:'meta'},
              el('span',{class:'cname'},c?c.name:''),
              el('span',{class:'mono'},fmtDate(a)),
              el('span',{class:'pill '+s.cls},s.label),
              isNew(a)?el('span',{class:'new'},'NOUVEAU'):null),
            el('h3',null,a.title),
            el('p',null,a.summary||'')));
      })));
    }
    if(S.storeNote) main.append(el('div',{class:'notice'},S.storeNote));
    app.replaceChildren(el('div',{class:'grid'}, rail, main));
  }

  let lastFocus = null;
  function closeSheet(){ S.open=null; renderSheet(); if(lastFocus) try{lastFocus.focus();}catch(e){} }
  function renderSheet(){
    const a = S.open && S.articles.find(x=>x.id===S.open);
    if(!a){ sheetRoot.replaceChildren(); document.body.style.overflow=''; return; }
    if(!sheetRoot.firstChild) lastFocus = document.activeElement;
    const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
    const paras = (t)=> String(t||'').split(/\n\s*\n/).filter(Boolean).map(p=>el('p',null,p));
    const closeBtn = el('button',{class:'x',type:'button','aria-label':'Fermer',onclick:closeSheet},svg(ICON_X,18));
    sheetRoot.replaceChildren(
      el('div',{class:'scrim',onclick:closeSheet}),
      el('div',{class:'sheet',role:'dialog','aria-modal':'true','aria-label':a.title},
        el('div',{class:'sheet-head'},
          el('span',{class:'eyebrow'}, c?c.name:''), closeBtn),
        el('div',{class:'sheet-body'},
          el('div',null,
            el('div',{class:'kicker'}, el('span',{class:'mono'},fmtDate(a)), el('span',{class:'pill '+s.cls},s.label), isNew(a)?el('span',{class:'new'},'NOUVEAU'):null),
            el('h2',null,a.title)),
          el('section',null, el('h4',null,'Ce qui se passe'), paras(a.detail||a.summary)),
          el('section',null, el('h4',null,'Ce que ça apporte à l\'entreprise'), paras(a.impact)),
          el('div',{class:'verdict-box '+s.cls}, el('span',{class:'v'},s.verdict), el('p',null,a.rationale||'')),
          (a.sources&&a.sources.length) ? el('section',null, el('h4',null,'Sources'),
            el('ul',{class:'sources'}, a.sources.filter(src=>safeUrl(src.url)).map(src=>el('li',null, el('a',{href:safeUrl(src.url),target:'_blank',rel:'noopener noreferrer'}, src.label||'Source', svg(ICON_OUT,14)))))) : null,
          el('p',{class:'disclaimer'},'Lecture éditoriale de l\'actualité publique de la société. Ne constitue pas un conseil en investissement.'))));
    document.body.style.overflow='hidden';
    closeBtn.focus();
  }
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && S.open) closeSheet(); });
  editBtn.addEventListener('click',()=>{ S.mode='pick'; S.draft=null; render(); });

  /* ---------- boot ---------- */
  async function getJSON(path){
    const r = await fetch(path, {cache:'no-cache'});
    if(!r.ok) throw new Error(path+' '+r.status);
    return r.json();
  }
  async function boot(){
    S.selection = lsGet(); S.selLoaded = true;
    try{
      const [cos, arts, st] = await Promise.all([getJSON('data/companies.json'), getJSON('data/articles.json'), getJSON('data/status.json').catch(()=>null)]);
      S.companies = cos; S.articles = arts; S.status = st;
      if(S.selection) S.selection = S.selection.filter(id=>cos.some(c=>c.id===id));
    }catch(e){ S.db = false; }
    render();
  }
  boot();
})();
