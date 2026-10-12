#!/usr/bin/env python3
"""Liste les titres Google News récents sur une société, en français et en anglais.

Usage :
  python3 scripts/news_feed.py --societe <id> [jours] [--liens]
      Lance toutes les requêtes de la société (champs "newsQuery" et "newsQueriesExtra" de companies.json)
      et fusionne les résultats. C'est l'usage normal du passage de veille.
  python3 scripts/news_feed.py '<requête>' [jours] [--liens]
      Une requête libre, syntaxe Google News, par ex. '"Mistral AI" OR "Arthur Mensch"'.
  python3 scripts/news_feed.py --societe <id> --depuis AAAA-MM-JJ
      Rattrapage long : interroge Google News mois par mois depuis cette date (une fenêtre after:/before: par mois),
      car un flux est plafonné à 100 titres et une fenêtre de plusieurs mois en perd beaucoup.
Jours par défaut : 2. Affiche une ligne par titre : date UTC | média | titre | site du média (et le lien Google News avec --liens).
Les liens Google News sont des redirections : pour lire l'article, cherche le titre exact (WebSearch) ou ouvre le site du média.
Plusieurs requêtes simples valent mieux qu'une seule longue : Google News perd des résultats quand on imbrique OR et parenthèses.
"""
import sys, os, re, json, html, signal, urllib.parse, urllib.request
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
from email.utils import parsedate_to_datetime

def queries_for(cid):
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'radar-site', 'data', 'companies.json')
    c = next((c for c in json.load(open(p, encoding='utf-8')) if c['id'] == cid), None)
    if not c: sys.exit(f'société inconnue : {cid}')
    return [q for q in [c.get('newsQuery')] + list(c.get('newsQueriesExtra', [])) if q]

def windows(since):
    """Fenêtres mensuelles 'after:A before:B' depuis la date donnée jusqu'à demain."""
    from datetime import date, timedelta
    d, end, out = date.fromisoformat(since), date.today() + timedelta(days=1), []
    while d < end:
        n = (d.replace(day=1) + timedelta(days=32)).replace(day=1)
        out.append(f'after:{(d - timedelta(days=1)).isoformat()} before:{min(n, end).isoformat()}')
        d = n
    return out

def fetch(query, days):
    """Titres Google News (FR et EN) pour une requête : liste de (date, média, titre, site, lien)."""
    rows = []
    span = days if days.startswith('after:') else f'when:{days}d'
    for hl, gl, ceid in (('fr', 'FR', 'FR:fr'), ('en-US', 'US', 'US:en')):
        q = urllib.parse.quote(f'{query} {span}')
        url = f'https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}'
        try:
            xml = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read().decode('utf-8', 'replace')
        except Exception as e:
            print(f'# flux {hl} indisponible pour {query} : {e}', file=sys.stderr); continue
        for item in re.findall(r'<item>(.*?)</item>', xml, re.S):
            g = lambda tag: (re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', item, re.S) or [None, ''])[1]
            title = html.unescape(g('title')).strip()
            src = re.search(r'<source url="([^"]+)">(.*?)</source>', item)
            try: d = parsedate_to_datetime(g('pubDate')).strftime('%Y-%m-%d %H:%M')
            except Exception: d = '?'
            rows.append((d, html.unescape(src.group(2)) if src else '?', title, src.group(1) if src else '?', g('link').strip()))
    return rows

def merged(queries, days):
    seen, out = set(), []
    for q in queries:
        for r in fetch(q, days):
            key = r[2].lower()[:80]
            if key in seen: continue
            seen.add(key); out.append(r)
    return sorted(out, reverse=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--liens']
    links = '--liens' in sys.argv
    if args and args[0] == '--societe':
        name, queries, rest = args[1], queries_for(args[1]), args[2:]
    else:
        name, queries, rest = args[0], [args[0]], args[1:]
    if rest[:1] == ['--depuis']:
        rows, seen = [], set()
        for w in windows(rest[1]):
            for r in merged(queries, w):
                if r[2].lower()[:80] not in seen: seen.add(r[2].lower()[:80]); rows.append(r)
        rows.sort(reverse=True); days = 'mois par mois depuis le ' + rest[1]
    else:
        days = rest[0] if rest else '2'
        rows = merged(queries, days)
    span = days if days.startswith('mois') else f'{days} jour(s)'
    print(f'# {name} : {len(rows)} titres sur {span}, {len(queries)} requête(s)')
    for r in rows: print(' | '.join(r if links else r[:4]))
