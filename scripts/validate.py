#!/usr/bin/env python3
"""Vérifie les données du radar avant chaque commit. Sort en erreur si un problème est trouvé."""
import json, re, sys, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'radar-site'))
from datetime import datetime, timezone
from urllib.parse import urlparse
from difflib import SequenceMatcher

errors = []
def err(msg): errors.append(msg)

cos = json.load(open('data/companies.json', encoding='utf-8'))
arts = json.load(open('data/articles.json', encoding='utf-8'))
status = json.load(open('data/status.json', encoding='utf-8'))
ids = {c['id'] for c in cos}
BANNED = ['—', '–', 'Fundora']
SIGNALS = {'optimiste', 'neutre', 'prudent'}
REQ = ['id', 'companyId', 'date', 'addedAt', 'signal', 'title', 'summary', 'detail', 'impact', 'rationale', 'sources']
now = datetime.now(timezone.utc)
seen = set()

def ok_url(u):
    p = urlparse(u or '')
    return p.scheme == 'https' and bool(p.netloc)

for c in cos:
    if c.get('website') and not ok_url(c['website']): err(f"société {c['id']}: URL invalide (https obligatoire)")
for a in arts:
    aid = a.get('id', '?')
    for k in REQ:
        if not a.get(k): err(f"{aid}: champ manquant {k}")
    if aid in seen: err(f"{aid}: id en double")
    seen.add(aid)
    if not re.fullmatch(r'[a-z0-9-]{3,120}', aid): err(f"{aid}: id invalide")
    if a.get('companyId') not in ids: err(f"{aid}: société inconnue {a.get('companyId')}")
    if a.get('signal') not in SIGNALS: err(f"{aid}: signal invalide")
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', a.get('date', '')): err(f"{aid}: date invalide")
    elif a['date'] > now.strftime('%Y-%m-%d'): err(f"{aid}: date dans le futur")
    try:
        t = datetime.fromisoformat(a['addedAt'].replace('Z', '+00:00'))
        if (t - now).total_seconds() > 600: err(f"{aid}: addedAt dans le futur")
    except Exception: err(f"{aid}: addedAt invalide")
    for s in a.get('sources', []):
        if not ok_url(s.get('url')): err(f"{aid}: URL de source invalide (https obligatoire)")
    blob = json.dumps(a, ensure_ascii=False)
    for w in BANNED:
        if w in blob: err(f"{aid}: contient {w!r}")
    if '<' in blob and re.search(r'<\s*(script|iframe|img|a)\b', blob, re.I): err(f"{aid}: contient du HTML")
# Même URL de source, même société, 3 jours d'écart ou moins et titres proches :
# très probablement le même événement publié deux fois, donc bloquant.
# Sinon (page générique, autre angle tiré de la même source), simple avertissement.
dups = {}
for a in arts:
    for s in a.get('sources', []): dups.setdefault(s.get('url'), []).append(a)
warnings = []
for url, lst in dups.items():
    for i, x in enumerate(lst):
        for y in lst[i + 1:]:
            if x['id'] == y['id']: continue
            try: gap = abs((datetime.fromisoformat(x['date']) - datetime.fromisoformat(y['date'])).days)
            except Exception: gap = None
            sim = SequenceMatcher(None, x.get('title', '').lower(), y.get('title', '').lower()).ratio()
            if x.get('companyId') == y.get('companyId') and gap is not None and gap <= 3 and sim >= 0.5:
                err(f"{x['id']} / {y['id']}: même source, {gap} j d'écart, titres proches, doublon probable ({url})")
            else:
                warnings.append(f"avertissement : source partagée par {x['id']} et {y['id']} ({url})")
if not status.get('lastRun'): err('status: lastRun manquant')

if warnings: print('\n'.join(warnings))
if errors:
    print('\n'.join(errors)); sys.exit(1)
print(f"OK : {len(cos)} sociétés, {len(arts)} articles")
