#!/usr/bin/env python3
"""Génère les pages d'aperçu de partage : radar-site/a/<id>.html (articles) et radar-site/s/<id>.html (sociétés).

Le site est une seule page : une adresse en #id n'est jamais envoyée au serveur, si bien que WhatsApp, LinkedIn
ou un e-mail affichent toujours le même aperçu. Ces petites pages portent le titre, le résumé et le signal dans
leurs balises Open Graph, puis redirigent aussitôt vers le Radar (#id ou #societe/<id>).
Usage : python3 scripts/build_share.py   (supprime les pages devenues orphelines, n'écrit que ce qui change)
"""
import json, os, html
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'radar-site'))
SITE = 'https://radar.rod-investment.fr'
IMG = SITE + '/og/radar.png'
MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
SIG = {'optimiste': 'Signal optimiste', 'neutre': 'Signal neutre', 'prudent': 'Signal prudent'}
e = lambda s: html.escape(str(s or ''), quote=True)

def fdate(d, label=None):
    if label: return label
    y, m, j = d.split('-'); return f'{int(j)} {MONTHS[int(m) - 1]} {y}'

def page(path, title, desc, target, kind='article', published=None):
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="{SITE}/{path}">
<meta property="og:site_name" content="Radar ROD Investment">
<meta property="og:type" content="{kind}">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{SITE}/{path}">
<meta property="og:image" content="{IMG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Radar. ROD Investment, veille sociétés non cotées">
{f'<meta property="article:published_time" content="{e(published)}">' if published else ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{IMG}">
<meta name="theme-color" content="#0D6E5E">
<meta http-equiv="refresh" content="0; url={e(target)}">
<style>body{{margin:0;font:16px/1.5 system-ui,sans-serif;background:#F3F5F4;color:#14201B;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}}a{{color:#0D6E5E}}</style>
</head>
<body><p><a href="{e(target)}">Ouvrir sur le Radar</a></p></body>
</html>
'''

cos = json.load(open('data/companies.json', encoding='utf-8'))
arts = json.load(open('data/articles.json', encoding='utf-8'))
by = {c['id']: c for c in cos}
want = {}
for a in arts:
    c = by.get(a['companyId'], {})
    desc = f"{SIG.get(a.get('signal'), 'Signal')} · {fdate(a['date'], a.get('dateLabel'))} · {a.get('summary', '')}"
    want[f"a/{a['id']}.html"] = page(f"a/{a['id']}", f"{c.get('name', '')} : {a['title']}", desc, f"/#{a['id']}", 'article', a['date'])
for c in cos:
    vals = sorted(c.get('valuations', []), key=lambda v: v['date'], reverse=True)
    off = next((v for v in vals if v['status'] == 'officielle'), None)
    n = sum(1 for a in arts if a['companyId'] == c['id'])
    bits = [c.get('oneLiner', '')]
    if off: bits.append(f"Dernière valorisation officielle : {off['amount']}, {off['round'][0].lower() + off['round'][1:]}, {fdate(off['date'], off.get('dateLabel'))}.")
    bits.append(f"{n} actualité{'s' if n > 1 else ''} suivie{'s' if n > 1 else ''} par le Radar.")
    want[f"s/{c['id']}.html"] = page(f"s/{c['id']}", f"{c['name']} · fiche société du Radar", ' '.join(b for b in bits if b), f"/#societe/{c['id']}", 'website')

changed = 0
for d in ('a', 's'):
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if f'{d}/{f}' not in want: os.remove(f'{d}/{f}'); changed += 1
for path, body in want.items():
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    if old != body: open(path, 'w', encoding='utf-8').write(body); changed += 1
print(f'{len(want)} pages de partage, {changed} modifiée(s)')
