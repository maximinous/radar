#!/usr/bin/env python3
"""Contrôle de couverture : liste les titres Google News récents qui ressemblent à un événement important
mais qu'aucun article du Radar ne semble couvrir.

Usage : python3 scripts/coverage.py [heures]   (36 par défaut)
Écrit veille/candidats.json et veille/candidats.md. Le passage du matin de la veille doit examiner chaque candidat.
Sans IA ni recherche web : un simple filtre par mots d'événement, puis par ressemblance avec les articles déjà publiés.
"""
import json, os, re, sys, html, unicodedata, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
HOURS = int(sys.argv[1]) if len(sys.argv) > 1 else 36
now = datetime.now(timezone.utc)
since = now - timedelta(hours=HOURS)

# Mots qui signalent un événement de la section « Sélection » de la veille, en français et en anglais.
EVENT = re.compile(r"\b(l[eè]ve|lev[ée]e|raises?|raised|funding|financement|valoris|valuation|valued|ipo|introduction en bourse|"
    r"rach[eè]te|rachat|acqui|acquisition|buys?|merger|fusion|partenariat|partnership|partners?|alliance|accord|deal|agreement|"
    r"contrat|contract|client|customer|choisit|selects?|signs?|signe|lance|launch|launches|unveils?|d[ée]voile|annonce|announces?|"
    r"nomm|appoint|hires?|recrute|ceo|d[ée]part|leaves|steps down|proc[eè]s|lawsuit|sues?|poursuit|enqu[eê]te|probe|investigation|"
    r"r[ée]gulat|regulator|fine|amende|interdi|ban|licenciement|layoffs?|revenue|revenus|chiffre d'affaires|arr|bureau|office|"
    r"expands?|expansion|ouvre|opens?|data ?cent|usine|factory|gigawatt|tender)\b", re.I)
STOP = set('le la les de des du un une et en au aux pour par sur avec dans son sa ses ce cette qui que a the of to and in for on with by at from as its is an new'.split())

def fold(s): return ''.join(ch for ch in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(ch) != 'Mn')
# Racines de 5 lettres : « parameter » et « paramètres », « model » et « modèle » se rejoignent entre l'anglais et le français.
def toks(s): return {w[:5] for w in re.findall(r"[a-z0-9]+", fold(s)) if len(w) > 2 and w not in STOP}
# Contenus sans fait nouveau : guides d'achat d'actions, classements, cours de bourse.
JUNK = re.compile(r"how to (buy|invest)|comment (acheter|investir)|investir dans|investing in|pre-?ipo shares|stock price|share price|"
    r"\bbest\b.*\b(services|tools|alternatives)\b|\btop \d+|alternatives? to|vs\.? |review\b|prediction:|price prediction", re.I)

def feed(query):
    out = []
    for hl, gl, ceid in (('fr', 'FR', 'FR:fr'), ('en-US', 'US', 'US:en')):
        q = urllib.parse.quote(f'{query} when:2d')
        url = f'https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}'
        try: xml = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read().decode('utf-8', 'replace')
        except Exception as e: print(f'# {query} ({hl}) indisponible : {e}', file=sys.stderr); continue
        for item in re.findall(r'<item>(.*?)</item>', xml, re.S):
            g = lambda tag: (re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', item, re.S) or [None, ''])[1]
            title = html.unescape(g('title')).strip()
            src = re.search(r'<source url="([^"]+)">(.*?)</source>', item)
            try: d = parsedate_to_datetime(g('pubDate')).astimezone(timezone.utc)
            except Exception: continue
            media = html.unescape(src.group(2)) if src else ''
            # Google News ajoute « - Média » à la fin du titre.
            if media and title.endswith(' - ' + media): title = title[:-len(media) - 3]
            out.append({'date': d, 'title': title, 'media': media, 'site': src.group(1) if src else ''})
    return out

cos = json.load(open('radar-site/data/companies.json', encoding='utf-8'))
arts = json.load(open('radar-site/data/articles.json', encoding='utf-8'))
res, total = [], 0
for c in cos:
    if not c.get('newsQuery'): continue
    mine = [a for a in arts if a['companyId'] == c['id'] and a['date'] >= (since - timedelta(days=4)).strftime('%Y-%m-%d')]
    known = [(toks(' '.join([a['title'], a.get('summary', ''), a.get('detail', '')]) + ' ' + ' '.join(s.get('label', '') + ' ' + s.get('url', '') for s in a.get('sources', []))), a) for a in mine]
    hosts = {urllib.parse.urlparse(s.get('url', '')).netloc.replace('www.', '') for a in mine for s in a.get('sources', [])}
    # Le titre doit nommer la société (nom, termes entre guillemets de la requête, ou premier mot du nom s'il est distinctif).
    alias = {fold(x) for x in re.findall(r'"([^"]+)"', c['newsQuery'])} | {fold(c['name'])}
    first = fold(c['name']).split()[0]
    if len(first) >= 6 and first not in {'together', 'figure', 'shield', 'apollo', 'prometheus'}: alias.add(first)
    cands = []
    for it in sorted(feed(c['newsQuery']), key=lambda x: x['date'], reverse=True):
        total += 1
        if it['date'] < since or not EVENT.search(it['title']) or JUNK.search(it['title']): continue
        if not any(re.search(r'\b' + re.escape(x) + r'\b', fold(it['title'])) for x in alias): continue
        t = toks(it['title']) - toks(c['name'])
        # Même histoire reprise par plusieurs médias : on garde le premier titre et on compte les reprises.
        dup = next((x for x in cands if len(t & x['_t']) / max(1, min(len(t), len(x['_t']))) >= 0.5), None)
        if dup: dup['reprises'] += 1; continue
        # Couvert si un article récent de la société partage l'essentiel des mots du titre (ou cite le même média, avec des mots communs).
        best = max((len(t & k) / max(1, len(t)) for k, _ in known), default=0)
        host = urllib.parse.urlparse(it['site']).netloc.replace('www.', '')
        if best >= 0.4 or (host and host in hosts and best >= 0.25): continue
        cands.append({'date': it['date'].strftime('%Y-%m-%d %H:%M'), 'media': it['media'], 'title': it['title'], 'site': it['site'], 'overlap': round(best, 2), 'reprises': 0, '_t': t})
    for x in cands: x.pop('_t')
    # Les histoires reprises par plusieurs médias passent en premier ; 6 pistes au plus par société.
    cands.sort(key=lambda x: (-x['reprises'], x['date']), reverse=False)
    if cands: res.append({'companyId': c['id'], 'name': c['name'], 'candidates': cands[:6]})

os.makedirs('veille', exist_ok=True)
out = {'generatedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'windowHours': HOURS, 'headlinesRead': total,
       'count': sum(len(r['candidates']) for r in res), 'companies': res}
json.dump(out, open('veille/candidats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = [f"# Candidats non couverts ({out['count']})", '',
         f"Contrôle du {out['generatedAt']} sur {HOURS} h : {total} titres Google News lus, filtrés sur les mots d'événement, "
         "puis comparés aux articles publiés. Ce sont des pistes, pas des articles : chacune doit être ouverte et vérifiée.", '']
for r in res:
    lines += [f"## {r['name']} ({len(r['candidates'])})", '']
    lines += [f"- {x['date']} | {x['media']} | {x['title']} | {x['site']}" + (f" (+{x['reprises']} reprise{'s' if x['reprises'] > 1 else ''})" if x['reprises'] else '') for x in r['candidates']] + ['']
open('veille/candidats.md', 'w', encoding='utf-8').write('\n'.join(lines))
print(f"{total} titres lus, {out['count']} candidat(s) non couvert(s) pour {len(res)} société(s)")
