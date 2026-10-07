if (location.protocol === 'http:' && location.hostname !== 'localhost') {
  location.replace('https://' + location.host + location.pathname + location.search + location.hash);
}

(function(){
  const app = document.getElementById('app');
  const stamp = document.getElementById('stamp');
  const editBtn = document.getElementById('editSel');
  const sheetRoot = document.getElementById('sheetRoot');
  const themeBtn = document.getElementById('themeBtn');
  const compareBtn = document.getElementById('compareBtn');
  const weekBtn = document.getElementById('weekBtn');
  const feedBtn = document.getElementById('feedBtn');
  const printRoot = document.getElementById('printRoot');

  const S = {
    db:null, companies:[], articles:[], status:null,
    selection:null, selLoaded:false, draft:null, mode:'feed',
    company:null, signal:'all', open:null, storeNote:'', page:1, pageKey:'',
    q:'', view:'feed', since:0, sortKey:'valo', sortDir:-1
  };
  // Taux indicatif pour classer les valorisations en euros parmi celles en dollars (tri du comparatif uniquement).
  const EUR_USD = 1.17;
  const SITE_URL = 'https://radar.rod-investment.fr/';
  const LS_KEY = 'radar-selection-v1';
  const LS_VISIT = 'radar-last-visit-v1';
  const SS_SINCE = 'radar-since-v1';
  const LS_READ = 'radar-read-v1';
  // Articles déjà ouverts : ils perdent leur badge « Nouveau ».
  const READ = new Set((()=>{ try{ return JSON.parse(localStorage.getItem(LS_READ))||[]; }catch(e){ return []; } })());
  function markRead(id){
    if(READ.has(id)) return;
    READ.add(id);
    try{ localStorage.setItem(LS_READ, JSON.stringify([...READ].slice(-1000))); }catch(e){}
  }
  const LS_THEME = 'radar-theme';
  const PAGE_SIZE = 10;
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
  const ICON_LINK = '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>';
  const ICON_SEARCH = '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>';
  const ICON_SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>';
  const ICON_MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';
  const ICON_AUTO = '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>';
  const ICON_PDF = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9.5 14.5L12 17l2.5-2.5"/>';
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
  // « Nouveau » = ajouté depuis la visite précédente (repère gardé pour tout l'onglet, même après un rechargement).
  function isNew(a){
    if(!a.addedAt) return false;
    const t = Date.parse(a.addedAt); if(isNaN(t)) return false;
    return t > S.since && !READ.has(a.id);
  }
  function fold(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function matches(a, terms){
    if(!terms.length) return true;
    const c = coById(a.companyId);
    const hay = fold([a.title, a.summary, a.detail, a.impact, c&&c.name].join(' '));
    return terms.every(t=>hay.includes(t));
  }
  function articleUrl(id){ return location.origin + location.pathname + location.search + '#' + id; }
  function companyUrl(id){ return articleUrl('societe/' + id); }
  // Liens à partager : pages d'aperçu générées par scripts/build_share.py (titre, résumé et signal dans l'aperçu), qui redirigent ici.
  function shareArticleUrl(id){ return location.origin + '/a/' + id; }
  function shareCompanyUrl(id){ return location.origin + '/s/' + id; }
  // Adresse de la vue courante : fiche société (#societe/<id>), comparatif (#comparer) ou fil (aucune).
  function viewHash(){ return S.mode==='compare' ? 'comparer' : S.mode==='week' ? 'semaine/' + S.week : S.company ? 'societe/' + S.company : null; }
  function goCompany(id){
    if(id && !(S.selection||[]).includes(id)){ S.selection = (S.selection||[]).concat(id); lsSet(S.selection); }
    S.company = id; S.mode = 'feed'; setHash(viewHash()); render();
    window.scrollTo({top:0,behavior:'smooth'});
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
    const needOnb = S.mode==='pick' || (S.mode!=='compare' && S.mode!=='week' && (!S.selection || !S.selection.length));
    const special = S.mode==='compare' || S.mode==='week';
    editBtn.hidden = needOnb || special;
    compareBtn.hidden = weekBtn.hidden = needOnb && !special;
    feedBtn.hidden = !special;
    compareBtn.setAttribute('aria-pressed', String(S.mode==='compare'));
    weekBtn.setAttribute('aria-pressed', String(S.mode==='week'));
    if(S.mode==='compare') renderCompare(); else if(S.mode==='week') renderWeek(); else if(needOnb) renderPick(); else renderFeed();
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
          el('button',{class:'co',type:'button','aria-current':String(!S.company),onclick:()=>goCompany(null)},
            el('span',{class:'n'},'Toutes'), el('span',{class:'c mono'}, String(mine.length))),
          followed.map(c=>{
            const arts = S.articles.filter(a=>a.companyId===c.id);
            return el('button',{class:'co',type:'button','aria-current':String(S.company===c.id),onclick:()=>goCompany(c.id)},
              el('span',{class:'n'},c.name), balanceBar(counts(arts)));
          }))),
      el('div',null, el('h3',null,'Signal'),
        el('div',{class:'filters'},
          [['all','Tous',null],['optimiste','Optimiste','var(--pos)'],['neutre','Neutre','var(--neu)'],['prudent','Prudent','var(--neg)']].map(([k,l,col])=>
            el('button',{class:'chip',type:'button','aria-pressed':String(S.signal===k),onclick:()=>{S.signal=k;render();}},
              col?el('span',{class:'dot-s',style:'background:'+col}):null, l)))),
      locked.length ? el('div',null, el('h3',null,'Non suivies'),
        el('div',{class:'co-list'}, locked.map(c=>
          el('button',{class:'co locked',type:'button',title:'Ajouter à ma veille',onclick:()=>goCompany(c.id)},
            el('span',{class:'n'},c.name), svg(ICON_LOCK))))) : null
    );

    const terms = fold(S.q).split(/\s+/).filter(Boolean);
    let list = S.company ? mine.filter(a=>a.companyId===S.company) : mine;
    if(S.signal!=='all') list = list.filter(a=>a.signal===S.signal);
    list = list.filter(a=>matches(a, terms));
    list = list.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.addedAt||'').localeCompare(a.addedAt||''));
    // Pagination : retour à la page 1 dès que la société, le signal, la recherche ou la sélection change.
    const pageKey = [S.company, S.signal, S.q, S.selection.join(',')].join('|');
    if(S.pageKey !== pageKey){ S.pageKey = pageKey; S.page = 1; }
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    S.page = Math.min(Math.max(1, S.page), pages);
    const shown = list.slice((S.page-1)*PAGE_SIZE, S.page*PAGE_SIZE);

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
            safeUrl(c.website)?el('span',null,el('a',{href:safeUrl(c.website),target:'_blank',rel:'noopener noreferrer'},'Site officiel')):null),
          roundBox(c),
          arts.length ? el('p',{class:'since mono'}, arts.length + (arts.length>1?' articles':' article') + ' depuis le ' + fmtDate(arts.reduce((m,a)=>(a.date||'')<(m.date||'')?a:m))) : null,
          el('div',{class:'hero-actions'},
            linkBtn(shareCompanyUrl(c.id), c.name),
            exportMenu(c))),
        el('div',{class:'side'},
        valuationBox(c),
        el('div',{class:'mood'},
          el('span',{class:'eyebrow'},'Tonalité de la veille'),
          el('span',{class:'verdict',style:'color:var(--'+lean[1]+')'},lean[0]),
          balanceBar(k,'bar'),
          el('div',{class:'legend mono'},
            el('span',null,k.optimiste+' optimiste'+(k.optimiste>1?'s':'')),
            el('span',null,k.neutre+' neutre'+(k.neutre>1?'s':'')),
            el('span',null,k.prudent+' prudent'+(k.prudent>1?'s':'')))))
      ));
      const kpis = metricsBox(c);
      if(kpis) main.append(kpis);
      const chart = valuationChart(c);
      if(chart) main.append(el('section',{class:'valo-card'},
        el('div',{class:'valo-card-head'}, el('h3',null,'Historique de valorisation'),
          el('span',{class:'vlegend'}, el('span',{class:'k off'}), 'officielle', el('span',{class:'k press'}), 'selon la presse')),
        chart));
    }
    const timeline = S.company && S.view==='timeline';
    const fresh = list.filter(isNew).length;
    const head = el('div',{class:'feed-head'},
      el('h2',null, S.company ? 'Actualités' : 'Mon fil de veille'),
      S.company ? el('div',{class:'seg',role:'group','aria-label':'Affichage'},
        [['feed','Fil'],['timeline','Chronologie']].map(([k,l])=>
          el('button',{type:'button','aria-pressed':String(S.view===k),onclick:()=>{S.view=k;render();}},l))) : null,
      el('span',{class:'count mono'}, list.length + (list.length>1?' articles':' article')
        + (fresh ? ' · '+fresh+(fresh>1?' nouveaux':' nouveau') : '')
        + (pages>1 && !timeline ? ' · page '+S.page+' sur '+pages : '')));
    const search = el('label',{class:'search'}, svg(ICON_SEARCH,16),
      el('input',{id:'q',type:'search',placeholder:'Rechercher : levée, Toronto, contrat…','aria-label':'Rechercher dans le fil',autocomplete:'off',value:S.q,
        oninput:e=>{ S.q = e.target.value; render(); }}));
    main.append(search, head);
    if(!list.length){
      main.append(el('div',{class:'empty'}, terms.length ? 'Aucun article ne correspond à « ' + S.q.trim() + ' ».' : S.signal!=='all' ? 'Aucun article avec ce signal pour le moment.' : 'Pas encore d\'actualité pour cette sélection. Le fil se complète à chaque mise à jour.'));
    } else if(timeline){
      main.append(renderTimeline(list));
    } else {
      main.append(el('div',{class:'feed'}, shown.map(a=>{
        const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
        return el('button',{class:'card '+s.cls,type:'button',onclick:()=>openArticle(a.id)},
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
      if(pages>1) main.append(pager(S.page, pages, p=>{
        S.page = p; render();
        const h = app.querySelector('.feed-head');
        if(h) h.scrollIntoView({behavior:'smooth', block:'start'});
      }));
    }
    if(S.storeNote) main.append(el('div',{class:'notice'},S.storeNote));
    // Le fil est reconstruit à chaque frappe : on rend le focus et le curseur au champ de recherche.
    const f = document.activeElement, caret = f && f.id==='q' ? f.selectionStart : null;
    app.replaceChildren(el('div',{class:'grid'}, rail, main));
    if(caret!=null){ const q = document.getElementById('q'); q.focus(); try{ q.setSelectionRange(caret, caret); }catch(e){} }
  }

  /* ---------- partage ---------- */
  // Bouton « Copier le lien » (menu de partage natif sur mobile).
  function linkBtn(url, title){
    const b = el('button',{class:'btn ghost small',type:'button',onclick:()=>share(url, title, b)}, svg(ICON_LINK,15), el('span',null,'Copier le lien'));
    return b;
  }
  async function share(url, title, btn){
    if(navigator.share && matchMedia('(pointer:coarse)').matches){
      try{ await navigator.share({title, url}); }catch(e){}
      return;
    }
    try{ await navigator.clipboard.writeText(url); btn.lastChild.textContent = 'Lien copié'; }
    catch(e){ window.prompt('Copiez le lien :', url); return; }
    setTimeout(()=>{ if(btn.isConnected) btn.lastChild.textContent = 'Copier le lien'; }, 2000);
  }

  /* ---------- valorisations ---------- */
  function vals(c){ return (c.valuations||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')); }
  function lastOfficial(c){ return vals(c).find(v=>v.status==='officielle'); }
  function lastPress(c){ const o = lastOfficial(c); return vals(c).find(v=>v.status==='presse' && (!o || (v.date||'') > (o.date||''))); }
  function usd(v){ return v ? (v.currency==='EUR' ? v.value*EUR_USD : v.value) : -1; }
  function short(v){ // 12,7 Md$ / 21 Md€
    if(typeof v.value!=='number') return v.amount;
    const n = v.value>=100 ? Math.round(v.value) : Math.round(v.value*10)/10;
    return String(n).replace('.',',') + (v.currency==='EUR' ? ' Md€' : ' Md$');
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, ...kids){
    const n = document.createElementNS(SVGNS, tag);
    for(const k in attrs||{}) if(attrs[k]!=null) n.setAttribute(k, attrs[k]);
    kids.flat().forEach(k=>{ if(k!=null) n.append(k.nodeType?k:document.createTextNode(String(k))); });
    return n;
  }
  function niceMax(m){ const p = Math.pow(10, Math.floor(Math.log10(m))); for(const f of [1,2,2.5,5,10]) if(f*p>=m) return f*p; return 10*p; }
  // Courbe de valorisation : une seule série (pas de légende de série), points pleins = officielle, creux = presse.
  function valuationChart(c, opts){
    const pts = vals(c).filter(v=>typeof v.value==='number').reverse();
    if(pts.length<2) return null;
    const W = 640, H = 230, L = 52, R = 18, T = 26, B = 30;
    const t = v=>Date.parse(v.date);
    const t0 = t(pts[0]), t1 = t(pts[pts.length-1]), span = Math.max(t1-t0, 1);
    const top = niceMax(Math.max(...pts.map(v=>v.value))*1.08);
    const x = v=> L + (t(v)-t0)/span*(W-L-R);
    const y = val=> T + (1-val/top)*(H-T-B);
    const unit = pts[0].currency==='EUR' ? ' Md€' : ' Md$';
    const g = sv('svg',{viewBox:'0 0 '+W+' '+H,class:'vchart',role:'img','aria-label':'Historique de valorisation de '+c.name});
    for(let i=0;i<=4;i++){ const val = top*i/4, yy = y(val);
      g.append(sv('line',{x1:L,x2:W-R,y1:yy,y2:yy,class:i?'grid':'base'}),
        sv('text',{x:L-8,y:yy+4,'text-anchor':'end',class:'ax'}, String(Math.round(val*10)/10).replace('.',',')+(i===4?unit:''))); }
    const y0 = new Date(t0).getFullYear(), y1 = new Date(t1).getFullYear();
    for(let yr=y0; yr<=y1; yr++){ const tt = Date.UTC(yr,0,1); if(tt<t0-1 || tt>t1+1) continue;
      const xx = L + (tt-t0)/span*(W-L-R); g.append(sv('line',{x1:xx,x2:xx,y1:H-B,y2:H-B+5,class:'base'}), sv('text',{x:xx,y:H-B+18,'text-anchor':'middle',class:'ax'},String(yr))); }
    for(let i=1;i<pts.length;i++) g.append(sv('line',{x1:x(pts[i-1]),y1:y(pts[i-1].value),x2:x(pts[i]),y2:y(pts[i].value),class:'ln'+(pts[i].status==='presse'?' dash':'')}));
    const maxI = pts.reduce((m,v,i)=>v.value>pts[m].value?i:m,0);
    const tip = opts&&opts.print ? null : el('div',{class:'vtip',hidden:true});
    pts.forEach((v,i)=>{
      const cx = x(v), cy = y(v.value);
      g.append(sv('circle',{cx,cy,r:5,class:'pt'+(v.status==='presse'?' press':'')}));
      if(i===0 || i===pts.length-1 || i===maxI) g.append(sv('text',{x:Math.min(Math.max(cx,L+20),W-R-20),y:cy-11,'text-anchor':'middle',class:'lbl'}, short(v)));
      if(tip){
        const hit = sv('circle',{cx,cy,r:16,class:'hit',tabindex:'0','aria-label':v.amount+', '+v.round+', '+fmtDate(v)});
        const show = ()=>{ tip.replaceChildren(el('b',null,v.amount), el('span',null,v.round), el('span',{class:'mono'}, fmtDate(v)+' · '+(v.status==='presse'?'selon la presse':'officielle')));
          tip.hidden = false; tip.style.left = (cx/W*100)+'%'; tip.style.top = (cy/H*100)+'%'; tip.classList.toggle('flip', cx > W*0.6); };
        hit.addEventListener('mouseenter', show); hit.addEventListener('focus', show);
        hit.addEventListener('mouseleave', ()=>tip.hidden=true); hit.addEventListener('blur', ()=>tip.hidden=true);
        g.append(hit);
      }
    });
    const table = el('details',{class:'vdata'}, el('summary',null,'Voir les données'),
      el('table',null, el('thead',null, el('tr',null, el('th',null,'Date'), el('th',null,'Valorisation'), el('th',null,'Tour'), el('th',null,'Statut'), el('th',null,'Source'))),
        el('tbody',null, pts.slice().reverse().map(v=>el('tr',null, el('td',{class:'mono'},fmtDate(v)), el('td',null,v.amount), el('td',null,v.round),
          el('td',null, v.status==='presse'?'Presse':'Officielle'),
          el('td',null, safeUrl(v.source&&v.source.url) ? el('a',{href:safeUrl(v.source.url),target:'_blank',rel:'noopener noreferrer'}, v.source.label||'Source') : ''))))));
    return el('div',{class:'vwrap'}, el('div',{class:'vplot'}, g, tip), opts&&opts.print ? null : table);
  }

  /* ---------- chiffres clés ---------- */
  function metricsBox(c){
    const ms = c.metrics||[];
    if(!ms.length) return null;
    return el('section',{class:'kpi-card'},
      el('div',{class:'valo-card-head'}, el('h3',null,'Chiffres clés'), el('span',{class:'vlegend'},'Sources citées, officielles ou de presse')),
      el('div',{class:'kpis'}, ms.map(x=>el('div',{class:'kpi'+(x.label==='Investisseurs principaux'?' wide':'')},
        el('span',{class:'eyebrow'}, x.label),
        el('span',{class:'kv'}, x.value),
        el('span',{class:'km'},
          el('span',{class:'mono'}, fmtDate(x)),
          x.status==='presse' ? el('span',{class:'tagp'},'selon la presse') : null,
          safeUrl(x.source&&x.source.url) ? el('a',{href:safeUrl(x.source.url),target:'_blank',rel:'noopener noreferrer'}, x.source.label||'Source') : null,
          x.articleId && S.articles.some(a=>a.id===x.articleId) ? el('button',{class:'linklike',type:'button',onclick:()=>openArticle(x.articleId)},'Voir l\'article') : null)))));
  }

  /* ---------- la semaine du Radar ---------- */
  function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function today(){ return ymd(new Date()); }
  function parseYmd(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  function addDays(s, n){ const d = parseYmd(s); d.setDate(d.getDate()+n); return ymd(d); }
  function monday(s){ const d = parseYmd(s); const k = (d.getDay()+6)%7; d.setDate(d.getDate()-k); return ymd(d); }
  function weekLabel(mon){
    const a = parseYmd(mon), b = parseYmd(addDays(mon,6));
    const M = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return a.getMonth()===b.getMonth() ? 'du '+a.getDate()+' au '+b.getDate()+' '+M[b.getMonth()]+' '+b.getFullYear()
      : 'du '+a.getDate()+' '+M[a.getMonth()]+(a.getFullYear()!==b.getFullYear()?' '+a.getFullYear():'')+' au '+b.getDate()+' '+M[b.getMonth()]+' '+b.getFullYear();
  }
  function weekData(mon){
    const end = addDays(mon,6);
    const arts = S.articles.filter(a=>a.date>=mon && a.date<=end).sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b.addedAt||'').localeCompare(a.addedAt||''));
    const vals = [];
    S.companies.forEach(c=>(c.valuations||[]).forEach(v=>{ if(v.date>=mon && v.date<=end) vals.push({c, v}); }));
    vals.sort((a,b)=>usd(b.v)-usd(a.v));
    const byCo = S.companies.map(c=>({c, arts:arts.filter(a=>a.companyId===c.id)})).filter(x=>x.arts.length).sort((a,b)=>b.arts.length-a.arts.length || fold(a.c.name).localeCompare(fold(b.c.name)));
    return {end, arts, vals, byCo, prudent: arts.filter(a=>a.signal==='prudent'), k: counts(arts)};
  }
  function renderWeek(){
    const mon = S.week, W = weekData(mon), cur = monday(today());
    const go = m=>{ S.week = m; setHash(viewHash()); render(); window.scrollTo({top:0}); };
    const artRow = a=>{ const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
      return el('li',{class:s.cls}, el('button',{type:'button',onclick:()=>openArticle(a.id)},
        el('span',{class:'wmeta'}, el('span',{class:'mono'},fmtDate(a)), el('span',{class:'pill '+s.cls},s.label), isNew(a)?el('span',{class:'new'},'NOUVEAU'):null),
        el('span',{class:'t'}, a.title), el('span',{class:'sm'}, a.summary||''))); };
    app.replaceChildren(el('section',{class:'week'},
      el('div',{class:'cmp-head'},
        el('div',null, el('span',{class:'eyebrow'},'Synthèse hebdomadaire'), el('h2',null,'La semaine du Radar'), el('p',{class:'lead'}, 'Semaine '+weekLabel(mon)+'. Les faits marquants des 15 sociétés suivies.')),
        el('div',{class:'hero-actions'},
          el('button',{class:'btn ghost small',type:'button',onclick:()=>go(addDays(mon,-7))},'‹ Semaine précédente'),
          el('button',{class:'btn ghost small',type:'button',disabled:mon>=cur,onclick:()=>go(addDays(mon,7))},'Semaine suivante ›'),
          linkBtn(articleUrl('semaine/'+mon), 'La semaine du Radar'),
          el('button',{class:'btn ghost small',type:'button',onclick:()=>exportWeek(mon)}, svg(ICON_PDF,15), el('span',null,'PDF')))),
      el('div',{class:'wstats'},
        el('div',{class:'kpi'}, el('span',{class:'eyebrow'},'Actualités'), el('span',{class:'kv big'}, String(W.arts.length))),
        el('div',{class:'kpi'}, el('span',{class:'eyebrow'},'Sociétés concernées'), el('span',{class:'kv big'}, String(W.byCo.length))),
        el('div',{class:'kpi'}, el('span',{class:'eyebrow'},'Levées et valorisations'), el('span',{class:'kv big'}, String(W.vals.length))),
        el('div',{class:'kpi'}, el('span',{class:'eyebrow'},'Tonalité'), balanceBar(W.k,'bar'),
          el('span',{class:'km mono'}, W.k.optimiste+' optimiste'+(W.k.optimiste>1?'s':'')+' · '+W.k.neutre+' neutre'+(W.k.neutre>1?'s':'')+' · '+W.k.prudent+' prudent'+(W.k.prudent>1?'s':'')))),
      !W.arts.length && !W.vals.length ? el('div',{class:'empty'}, mon>=cur ? 'Pas encore d\'actualité cette semaine. Le Radar se complète à chaque passage, à 8h et 14h en semaine.' : 'Aucune actualité relayée cette semaine-là.') : null,
      W.vals.length ? el('section',{class:'wsec'}, el('h3',null,'Levées et valorisations'),
        el('ul',{class:'wvals'}, W.vals.map(({c,v})=>el('li',null,
          el('button',{class:'linklike strong',type:'button',onclick:()=>goCompany(c.id)}, c.name),
          el('span',{class:'kv'}, v.amount), el('span',{class:'sm'}, v.round+' · '+fmtDate(v)+(v.status==='presse'?' · selon la presse':' · officielle')),
          safeUrl(v.source&&v.source.url) ? el('a',{href:safeUrl(v.source.url),target:'_blank',rel:'noopener noreferrer',class:'sm'}, v.source.label||'Source') : null)))) : null,
      W.prudent.length ? el('section',{class:'wsec'}, el('h3',null,'Signaux prudents à surveiller'), el('ol',{class:'wlist'}, W.prudent.map(artRow))) : null,
      W.byCo.length ? el('section',{class:'wsec'}, el('h3',null,'Faits marquants par société'),
        W.byCo.map(({c,arts})=>el('div',{class:'wco'},
          el('div',{class:'wco-head'}, el('button',{class:'linklike strong',type:'button',onclick:()=>goCompany(c.id)}, c.name), el('span',{class:'mono sm'}, arts.length+(arts.length>1?' actualités':' actualité')), balanceBar(counts(arts))),
          el('ol',{class:'wlist'}, arts.map(artRow))))) : null));
  }
  function exportWeek(mon){
    const W = weekData(mon);
    const item = a=>{ const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
      return el('li',{class:s.cls}, el('div',{class:'p-nmeta'}, el('span',{class:'mono'},fmtDate(a)), el('span',{class:'pill '+s.cls},s.label)),
        el('p',{class:'p-ntitle'}, a.title), el('p',{class:'p-nsum'}, a.summary||'')); };
    const doc = pShell('La semaine du Radar · ' + weekLabel(mon),
      el('span',{class:'p-eyebrow'},'Synthèse hebdomadaire'),
      el('h1',{class:'p-title'}, el('mark',null,'La semaine du Radar')),
      pMeta([['Période', weekLabel(mon).replace(/^du /,'Du ')], ['Actualités', String(W.arts.length)], ['Sociétés', String(W.byCo.length)]]),
      el('div',{class:'p-cols'},
        el('section',{class:'p-box'}, el('h4',null,'Tonalité de la semaine'), balanceBar(W.k,'bar'),
          el('p',{class:'mono p-src'}, W.k.optimiste+' optimiste'+(W.k.optimiste>1?'s':'')+' · '+W.k.neutre+' neutre'+(W.k.neutre>1?'s':'')+' · '+W.k.prudent+' prudent'+(W.k.prudent>1?'s':''))),
        el('section',{class:'p-box'}, el('h4',null,'Levées et valorisations'),
          W.vals.length ? W.vals.map(({c,v})=>el('p',null, el('b',null,c.name+' : '), el('mark',null,v.amount), ' ('+v.round+(v.status==='presse'?', selon la presse':'')+')')) : el('p',null,'Aucune cette semaine.'))),
      W.prudent.length ? el('section',null, el('h4',null,'Signaux prudents à surveiller'), el('ol',{class:'p-news'}, W.prudent.map(item))) : null,
      W.byCo.map(({c,arts})=>el('section',null, el('h4',null, c.name+' (' + arts.length + ')'), el('ol',{class:'p-news'}, arts.map(item)))),
      pFoot(SITE_URL + '#semaine/' + mon));
    doPrint(doc, 'Radar - La semaine ' + weekLabel(mon));
  }

  /* ---------- comparatif ---------- */
  function renderCompare(){
    const rows = S.companies.map(c=>{
      const arts = S.articles.filter(a=>a.companyId===c.id);
      const last = arts.reduce((m,a)=>!m || (a.date||'')>(m.date||'') ? a : m, null);
      const off = lastOfficial(c), pr = lastPress(c);
      return {c, arts, last, off, pr, k:counts(arts), valo: usd(off)};
    });
    const key = {name:r=>fold(r.c.name), valo:r=>r.valo, round:r=>(r.off||r.pr||{}).date||'', arts:r=>r.arts.length, last:r=>r.last?r.last.date:''}[S.sortKey];
    rows.sort((a,b)=>{ const x = key(a), y = key(b); return (x<y?-1:x>y?1:0)*S.sortDir || fold(a.c.name).localeCompare(fold(b.c.name)); });
    const th = (k,label,cls)=> el('th',{class:cls||null,'aria-sort':S.sortKey===k?(S.sortDir>0?'ascending':'descending'):null},
      el('button',{type:'button',onclick:()=>{ if(S.sortKey===k) S.sortDir=-S.sortDir; else { S.sortKey=k; S.sortDir = k==='name'?1:-1; } render(); }},
        label, el('span',{class:'arrow','aria-hidden':'true'}, S.sortKey===k ? (S.sortDir>0?'↑':'↓') : '↕')));
    app.replaceChildren(el('section',{class:'cmp'},
      el('div',{class:'cmp-head'},
        el('div',null, el('h2',null,'Comparer les sociétés'),
          el('p',{class:'lead'},'Les 15 sociétés suivies, avec leur dernière valorisation officielle et l\'activité de la veille. Cliquez sur un en-tête pour trier, sur une ligne pour ouvrir la fiche.')),
        linkBtn(articleUrl('comparer'), 'Comparatif Radar')),
      el('div',{class:'tbl-wrap'}, el('table',{class:'tbl'},
        el('thead',null, el('tr',null, th('name','Société'), th('valo','Valorisation officielle'), th('round','Tour'), el('th',null,'Selon la presse'), th('arts','Articles','num'), el('th',null,'Tonalité'), th('last','Dernière actualité'))),
        el('tbody',null, rows.map(r=>el('tr',{tabindex:'0',onclick:()=>goCompany(r.c.id),onkeydown:e=>{ if(e.key==='Enter') goCompany(r.c.id); }},
          el('td',null, el('b',null,r.c.name), el('span',{class:'sub'}, r.c.sector||'')),
          el('td',{class:'v'}, r.off ? short(r.off) : el('span',{class:'sub'}, r.c.valuationNote ? 'Aucune publique' : 'Non officielle')),
          el('td',null, r.off ? el('span',null, r.off.round, el('span',{class:'sub mono'}, fmtDate(r.off))) : ''),
          el('td',null, r.pr ? el('span',null, short(r.pr), el('span',{class:'sub mono'}, fmtDate(r.pr))) : ''),
          el('td',{class:'num mono'}, String(r.arts.length)),
          el('td',null, balanceBar(r.k), el('span',{class:'sub mono'}, r.k.optimiste+' · '+r.k.neutre+' · '+r.k.prudent)),
          el('td',null, r.last ? el('span',null, el('span',{class:'mono'},fmtDate(r.last)), el('span',{class:'sub clamp'}, r.last.title)) : '')))))),
      el('p',{class:'cmp-note'},'Tri par valorisation officielle (les sociétés sans valorisation officielle viennent en dernier) ; les montants en euros sont convertis au taux indicatif de 1 € = '+String(EUR_USD).replace('.',',')+' $. Tonalité : articles optimistes · neutres · prudents.')));
  }

  /* ---------- export PDF (impression) ---------- */
  function logo(){
    return el('div',{class:'p-logo'},
      el('span',{class:'p-word'}, 'Radar', el('span',{class:'dot'},'.')),
      el('span',{class:'p-tag'}, 'ROD Investment · Veille sociétés non cotées'));
  }
  const FIG = /\d[\d\s,.]*\s*(milliards?|millions?|md|m€|m\$|%|dollars|euros|gigawatts?|mégawatts?)/i;
  // Surligne les phrases qui portent un chiffre clé (montant, pourcentage, capacité).
  function hl(text){
    return String(text||'').split(/\n\s*\n/).filter(Boolean).map(par=>el('p',null,
      par.split(/(?<=[.!?])\s+/).flatMap((s,i,arr)=>[ FIG.test(s) ? el('mark',null,s) : s, i<arr.length-1 ? ' ' : null ])));
  }
  function firstMarked(text){
    const parts = String(text||'').split(/(?<=[.!?])\s+/);
    return el('p',null, el('mark',null,parts[0]), parts.length>1 ? ' '+parts.slice(1).join(' ') : null);
  }
  function pMeta(rows){ return el('dl',{class:'p-meta'}, rows.filter(r=>r[1]).map(([k,v])=>el('div',null, el('dt',null,k), el('dd',null,v)))); }
  function pFoot(url){
    return el('footer',{class:'p-foot'},
      el('p',null,'En ligne : ', el('span',{class:'mono'},url)),
      el('p',null,'Lecture éditoriale de l\'actualité publique de la société, à partir des sources citées. Ne constitue pas un conseil en investissement. Investir dans des sociétés non cotées comporte un risque de perte totale du capital.'),
      el('p',{class:'mono'},'Exporté le ' + new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) + ' depuis radar.rod-investment.fr'));
  }
  function pShell(rubric, ...body){
    return el('article',{class:'pdoc'},
      el('div',{class:'p-side'}, el('span',null,'Radar · ROD Investment'), el('span',null, rubric)),
      logo(), ...body);
  }
  function doPrint(doc, filename){
    printRoot.replaceChildren(doc);
    const title = document.title;
    document.title = filename;
    document.documentElement.classList.add('printing');
    const done = ()=>{ document.documentElement.classList.remove('printing'); document.title = title; printRoot.replaceChildren(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(()=>window.print(), 50);
  }
  function slug(t){ return fold(t).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60); }
  function exportArticle(a){
    const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
    const doc = pShell((c?c.name:'') + ' · ' + (c&&c.sector||''),
      el('h1',{class:'p-title'}, el('mark',null,a.title)),
      pMeta([['Date', fmtDate(a)], ['Société', c?c.name:''], ['Signal', el('span',{class:'pill '+s.cls}, s.label)]]),
      el('p',{class:'p-lede'}, a.summary||''),
      el('section',null, el('h4',null,'Ce qui se passe'), hl(a.detail||a.summary)),
      el('section',null, el('h4',null,'Ce que ça apporte à l\'entreprise'), firstMarked(a.impact)),
      el('div',{class:'verdict-box '+s.cls}, el('span',{class:'v'},s.verdict), el('p',null,a.rationale||'')),
      (a.sources&&a.sources.length) ? el('section',null, el('h4',null,'Sources'),
        el('ol',{class:'p-sources'}, a.sources.filter(x=>safeUrl(x.url)).map(x=>el('li',null, el('b',null,x.label||'Source'), el('span',{class:'mono'}, x.url))))) : null,
      pFoot(SITE_URL + '#' + a.id));
    doPrint(doc, 'Radar - ' + (c?c.name+' - ':'') + a.title);
  }
  // Menu d'export d'une fiche : fiche seule, fiche + fil chronologique, fiche + articles complets.
  const EXPORTS = [
    ['fiche','Fiche seule','Présentation, valorisation, tonalité et historique.'],
    ['fil','Fiche et fil chronologique','Plus la liste des actualités : date, signal et titre.'],
    ['complet','Fiche et articles complets','Plus chaque actualité avec son résumé.']];
  function exportMenu(c){
    const open = S.exportMenu===c.id;
    return el('div',{class:'xwrap'},
      el('button',{class:'btn ghost small',type:'button','aria-haspopup':'menu','aria-expanded':String(open),onclick:()=>{ S.exportMenu = open ? null : c.id; render(); }},
        svg(ICON_PDF,15), el('span',null,'Exporter la fiche en PDF')),
      open ? el('div',{class:'xmenu',role:'menu'}, EXPORTS.map(([k,t,d])=>
        el('button',{type:'button',role:'menuitem',onclick:()=>{ S.exportMenu=null; render(); exportCompany(c,k); }},
          el('b',null,t), el('span',null,d)))) : null);
  }
  document.addEventListener('click',e=>{ if(S.exportMenu && !e.target.closest('.xwrap')){ S.exportMenu=null; render(); } });
  function exportCompany(c, mode){
    const arts = S.articles.filter(a=>a.companyId===c.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const k = counts(arts);
    const off = lastOfficial(c), pr = lastPress(c), main = off || pr;
    const lean = k.optimiste>k.prudent*2 ? ['Dynamique favorable','pos'] : k.prudent>k.optimiste ? ['Points de vigilance','neg'] : ['Dynamique contrastée','neu'];
    const doc = pShell(c.name + ' · ' + (c.sector||''),
      el('span',{class:'p-eyebrow'}, 'Fiche société · ' + (c.sector||'')),
      el('h1',{class:'p-title'}, el('mark',null,c.name)),
      el('p',{class:'p-lede'}, c.description||c.oneLiner||''),
      pMeta([['Siège', c.hq], ['Création', c.founded], ['Dirigeants', c.leaders], ['Site', safeUrl(c.website)]]),
      el('div',{class:'p-cols'},
        el('section',{class:'p-box'}, el('h4',null, off ? 'Dernière valorisation officielle' : 'Valorisation selon la presse'),
          main ? [el('p',{class:'p-amt'}, el('mark',null, main.amount)), el('p',null, main.round + ' · ' + fmtDate(main)),
            el('p',{class:'p-src'}, (main.source&&main.source.label)||''),
            !off ? el('p',{class:'p-src'},'Non confirmée par la société.') : null,
            off && pr ? el('p',{class:'p-press'}, el('b',null,'Plus récent, selon la presse : '), pr.amount + ' (' + pr.round + ', ' + fmtDate(pr) + ').') : null]
          : el('p',null, c.valuationNote || 'Aucune valorisation connue.')),
        el('section',{class:'p-box'}, el('h4',null,'Tonalité de la veille'),
          el('p',{class:'p-amt',style:'color:var(--'+lean[1]+')'}, lean[0]),
          balanceBar(k,'bar'),
          el('p',{class:'mono p-src'}, k.optimiste+' optimiste'+(k.optimiste>1?'s':'')+' · '+k.neutre+' neutre'+(k.neutre>1?'s':'')+' · '+k.prudent+' prudent'+(k.prudent>1?'s':''))) ),
      (c.metrics||[]).length ? el('section',null, el('h4',null,'Chiffres clés'),
        el('table',{class:'p-tbl p-kpi'}, el('tbody',null, c.metrics.map(x=>el('tr',null,
          el('td',null, el('b',null,x.label)), el('td',null, x.value), el('td',{class:'mono'}, fmtDate(x)),
          el('td',null, ((x.source&&x.source.label)||'') + (x.status==='presse' ? ' (presse)' : ''))))))) : null,
      valuationChart(c,{print:true}) ? el('section',null, el('h4',null,'Historique de valorisation'), valuationChart(c,{print:true}),
        el('table',{class:'p-tbl'}, el('tbody',null, vals(c).map(v=>el('tr',null, el('td',{class:'mono'},fmtDate(v)), el('td',null,el('b',null,v.amount)), el('td',null,v.round), el('td',null, v.status==='presse'?'Presse':'Officielle')))))) : null,
      mode==='fil' ? el('section',null, el('h4',null,'Fil chronologique (' + arts.length + ' actualités)'),
        el('ol',{class:'p-fil'}, arts.map(a=>{ const s = SIG[a.signal]||SIG.neutre;
          return el('li',{class:s.cls}, el('span',{class:'mono'},fmtDate(a)), el('span',{class:'pill '+s.cls},s.label),
            el('span',{class:'t'}, a.id===c.lastRound ? el('mark',null,a.title) : a.title)); }))) : null,
      mode==='complet' ? el('section',null, el('h4',null,'Actualités relayées (' + arts.length + ')'),
        el('ol',{class:'p-news'}, arts.map(a=>{ const s = SIG[a.signal]||SIG.neutre;
          return el('li',{class:s.cls}, el('div',{class:'p-nmeta'}, el('span',{class:'mono'},fmtDate(a)), el('span',{class:'pill '+s.cls},s.label)),
            el('p',{class:'p-ntitle'}, a.id===c.lastRound ? el('mark',null,a.title) : a.title),
            el('p',{class:'p-nsum'}, a.summary||'')); }))) : null,
      pFoot(SITE_URL + '#societe/' + c.id));
    doPrint(doc, 'Radar - Fiche ' + c.name);
  }

  // Dernière levée relayée par la veille : article désigné par lastRound dans companies.json.
  function roundBox(c){
    const a = c.lastRound && S.articles.find(x=>x.id===c.lastRound && x.companyId===c.id);
    if(!a) return null;
    return el('button',{class:'round',type:'button',onclick:()=>openArticle(a.id)},
      el('span',{class:'eyebrow'},'Dernière levée relayée'),
      el('span',{class:'t'}, a.title),
      el('span',{class:'d mono'}, fmtDate(a)));
  }

  // Valorisation : la dernière annoncée par la société (ou confirmée par un document officiel),
  // et, si elle est plus récente, la dernière rapportée par la presse sans confirmation.
  function valuationBox(c){
    const vals = (c.valuations||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const off = vals.find(v=>v.status==='officielle');
    const press = vals.find(v=>v.status==='presse' && (!off || (v.date||'') > (off.date||'')));
    if(!off && !press) return c.valuationNote ? el('div',{class:'valo'}, el('span',{class:'eyebrow'},'Valorisation'), el('p',{class:'note'},c.valuationNote)) : null;
    const src = v => safeUrl(v.source&&v.source.url) ? el('a',{href:safeUrl(v.source.url),target:'_blank',rel:'noopener noreferrer'}, v.source.label||'Source') : null;
    const main = off || press;
    return el('div',{class:'valo'},
      el('span',{class:'eyebrow'}, off ? 'Dernière valorisation officielle' : 'Valorisation selon la presse'),
      el('span',{class:'amt'}, main.amount),
      el('span',{class:'rd'}, main.round + ' · ' + fmtDate(main)),
      el('span',{class:'src'}, src(main)),
      !off ? el('p',{class:'note'},'Non confirmée par la société.') : null,
      off && press ? el('p',{class:'press'}, el('b',null,'Plus récent, selon la presse : '), press.amount + ' (' + press.round.charAt(0).toLowerCase() + press.round.slice(1) + ', ' + fmtDate(press) + '). ', src(press)) : null);
  }

  // Chronologie d'une société : tous ses articles, regroupés par mois, sans pagination.
  const MONTHS_LONG = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  function renderTimeline(list){
    const groups = [];
    list.forEach(a=>{
      const m = /^(\d{4})-(\d{2})/.exec(a.date||'');
      const key = m ? MONTHS_LONG[+m[2]-1] + ' ' + m[1] : 'Sans date';
      if(!groups.length || groups[groups.length-1].key!==key) groups.push({key, items:[]});
      groups[groups.length-1].items.push(a);
    });
    return el('div',{class:'tl'}, groups.map(g=>el('section',null,
      el('h3',{class:'tl-month'}, g.key, el('span',{class:'mono'}, String(g.items.length))),
      el('ol',null, g.items.map(a=>{ const s = SIG[a.signal]||SIG.neutre;
        return el('li',{class:s.cls}, el('button',{type:'button',onclick:()=>openArticle(a.id)},
          el('span',{class:'mono d'}, fmtDate(a)),
          el('span',{class:'t'}, a.title),
          isNew(a)?el('span',{class:'new'},'NOUVEAU'):null)); })))));
  }

  // Numéros de page affichés : la première, la dernière, et deux voisines de la page courante.
  function pageList(cur, total){
    const keep = new Set([1, total, cur-1, cur, cur+1]);
    if(cur<=3) [2,3,4].forEach(n=>keep.add(n));
    if(cur>=total-2) [total-1,total-2,total-3].forEach(n=>keep.add(n));
    const nums = [...keep].filter(n=>n>=1 && n<=total).sort((a,b)=>a-b);
    const out = [];
    nums.forEach((n,i)=>{ if(i && n-nums[i-1]>1) out.push(null); out.push(n); });
    return out;
  }
  function pager(cur, total, go){
    return el('nav',{class:'pager','aria-label':'Pages du fil'},
      el('button',{class:'pg nav',type:'button',disabled:cur<=1,'aria-label':'Page précédente',onclick:()=>go(cur-1)},'‹ Précédent'),
      el('span',{class:'nums'}, pageList(cur,total).map(n=> n===null
        ? el('span',{class:'gap','aria-hidden':'true'},'…')
        : el('button',{class:'pg',type:'button','aria-current':n===cur?'page':null,'aria-label':'Page '+n,onclick:()=>go(n)},String(n)))),
      el('button',{class:'pg nav',type:'button',disabled:cur>=total,'aria-label':'Page suivante',onclick:()=>go(cur+1)},'Suivant ›'));
  }

  let lastFocus = null;
  // Chaque article a son adresse (#id) : partageable, et ouverte directement au chargement.
  function setHash(id){ try{ history.replaceState(null,'', id ? '#'+id : location.pathname+location.search); }catch(e){} }
  function openArticle(id){ markRead(id); S.open=id; setHash(id); render(); }
  function closeSheet(){ S.open=null; setHash(viewHash()); renderSheet(); if(lastFocus) try{lastFocus.focus();}catch(e){} }
  // #<id d'article> ouvre l'article, #societe/<id> la fiche société, #comparer le comparatif.
  function readHash(){
    const id = decodeURIComponent(location.hash.slice(1));
    const m = /^societe\/(.+)$/.exec(id);
    if(m && coById(m[1])){ S.open=null; goCompany(m[1]); return; }
    if(id==='comparer'){ S.open=null; S.mode='compare'; render(); return; }
    const w = /^semaine(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(id);
    if(w){ S.open=null; S.mode='week'; S.week = monday(w[1] || today()); render(); return; }
    if(id && S.articles.some(a=>a.id===id)){ markRead(id); S.open=id; render(); }
    else if(S.open){ S.open=null; renderSheet(); }
  }
  function renderSheet(){
    const a = S.open && S.articles.find(x=>x.id===S.open);
    if(!a){ sheetRoot.replaceChildren(); document.body.style.overflow=''; return; }
    if(!sheetRoot.firstChild) lastFocus = document.activeElement;
    const s = SIG[a.signal]||SIG.neutre; const c = coById(a.companyId);
    const paras = (t)=> String(t||'').split(/\n\s*\n/).filter(Boolean).map(p=>el('p',null,p));
    const closeBtn = el('button',{class:'x',type:'button','aria-label':'Fermer',onclick:closeSheet},svg(ICON_X,18));
    const shareBtn = linkBtn(shareArticleUrl(a.id), a.title);
    const pdfBtn = el('button',{class:'btn ghost small',type:'button',title:'Exporter l\'article en PDF',onclick:()=>exportArticle(a)}, svg(ICON_PDF,15), el('span',null,'PDF'));
    sheetRoot.replaceChildren(
      el('div',{class:'scrim',onclick:closeSheet}),
      el('div',{class:'sheet',role:'dialog','aria-modal':'true','aria-label':a.title},
        el('div',{class:'sheet-head'},
          el('span',{class:'eyebrow'}, c?c.name:''),
          el('div',{class:'sheet-actions'}, pdfBtn, shareBtn, closeBtn)),
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
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    if(S.exportMenu){ S.exportMenu=null; render(); } else if(S.open) closeSheet();
  });
  editBtn.addEventListener('click',()=>{ S.mode='pick'; S.draft=null; render(); });
  compareBtn.addEventListener('click',()=>{ S.mode = S.mode==='compare' ? 'feed' : 'compare'; setHash(viewHash()); render(); window.scrollTo({top:0}); });
  feedBtn.addEventListener('click',()=>{ S.mode='feed'; setHash(viewHash()); render(); window.scrollTo({top:0}); });
  weekBtn.addEventListener('click',()=>{ if(S.mode==='week'){ S.mode='feed'; } else { S.mode='week'; S.week = S.week || monday(today()); } setHash(viewHash()); render(); window.scrollTo({top:0}); });
  window.addEventListener('hashchange', readHash);

  /* ---------- thème : automatique (réglage du système), clair ou sombre ---------- */
  const THEMES = {
    auto:{next:'light', icon:ICON_AUTO, label:'Thème automatique'},
    light:{next:'dark', icon:ICON_SUN, label:'Thème clair'},
    dark:{next:'auto', icon:ICON_MOON, label:'Thème sombre'}
  };
  function getTheme(){ try{ const t = localStorage.getItem(LS_THEME); return THEMES[t] && t!=='auto' ? t : 'auto'; }catch(e){ return 'auto'; } }
  function paintTheme(t){
    if(t==='auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    const th = THEMES[t];
    themeBtn.replaceChildren(svg(th.icon,16));
    themeBtn.setAttribute('aria-label', th.label + ' (changer)');
    themeBtn.title = th.label + ' : cliquez pour passer au ' + THEMES[th.next].label.toLowerCase();
    themeBtn.hidden = false;
  }
  themeBtn.addEventListener('click',()=>{
    const t = THEMES[getTheme()].next;
    try{ if(t==='auto') localStorage.removeItem(LS_THEME); else localStorage.setItem(LS_THEME, t); }catch(e){}
    paintTheme(t);
  });
  paintTheme(getTheme());

  /* ---------- dernière visite (badge « Nouveau ») ---------- */
  function initSince(){
    let since = null;
    try{ since = sessionStorage.getItem(SS_SINCE); }catch(e){}
    if(since==null){
      try{ since = localStorage.getItem(LS_VISIT); }catch(e){}
      // Première visite : on signale les ajouts des dernières 36 heures.
      if(since==null) since = String(Date.now() - 36*3600*1000);
      try{ sessionStorage.setItem(SS_SINCE, since); }catch(e){}
    }
    try{ localStorage.setItem(LS_VISIT, String(Date.now())); }catch(e){}
    S.since = +since || 0;
  }

  /* ---------- boot ---------- */
  async function getJSON(path){
    const r = await fetch(path, {cache:'no-cache'});
    if(!r.ok) throw new Error(path+' '+r.status);
    return r.json();
  }
  async function boot(){
    S.selection = lsGet(); S.selLoaded = true; initSince();
    try{
      const [cos, arts, st] = await Promise.all([getJSON('data/companies.json'), getJSON('data/articles.json'), getJSON('data/status.json').catch(()=>null)]);
      S.companies = cos; S.articles = arts; S.status = st;
      if(S.selection) S.selection = S.selection.filter(id=>cos.some(c=>c.id===id));
    }catch(e){ S.db = false; }
    render();
    readHash();
  }
  boot();
})();
