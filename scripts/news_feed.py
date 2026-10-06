#!/usr/bin/env python3
"""Liste les titres Google News récents sur une société, en français et en anglais.

Usage : python3 scripts/news_feed.py '<requête>' [jours] [--liens]
  <requête> : syntaxe Google News, par ex. '"Mistral AI" OR "Arthur Mensch"' ou
              'Kraken (crypto OR exchange OR Payward)'. Jours par défaut : 2.
Affiche une ligne par titre : date UTC | média | titre | site du média (et le lien Google News avec --liens).
Les liens Google News sont des redirections : pour lire l'article, cherche le titre exact
(WebSearch) ou ouvre le site du média indiqué.
"""
import sys, re, html, signal, urllib.parse, urllib.request
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
from email.utils import parsedate_to_datetime

args = [a for a in sys.argv[1:] if a != '--liens']
links = '--liens' in sys.argv
name = args[0]
days = args[1] if len(args) > 1 else '2'
seen = set()
rows = []
for hl, gl, ceid in (('fr', 'FR', 'FR:fr'), ('en-US', 'US', 'US:en')):
    q = urllib.parse.quote(f'{name} when:{days}d')
    url = f'https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}'
    try:
        xml = urllib.request.urlopen(url, timeout=20).read().decode('utf-8', 'replace')
    except Exception as e:
        print(f'# flux {hl} indisponible : {e}', file=sys.stderr); continue
    for item in re.findall(r'<item>(.*?)</item>', xml, re.S):
        g = lambda tag: (re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', item, re.S) or [None, ''])[1]
        title = html.unescape(g('title')).strip()
        src = re.search(r'<source url="([^"]+)">(.*?)</source>', item)
        try: d = parsedate_to_datetime(g('pubDate')).strftime('%Y-%m-%d %H:%M')
        except Exception: d = '?'
        key = title.lower()[:80]
        if key in seen: continue
        seen.add(key)
        rows.append((d, html.unescape(src.group(2)) if src else '?', title, src.group(1) if src else '?', g('link').strip()))
rows.sort(reverse=True)
print(f'# {name} : {len(rows)} titres sur {days} jour(s)')
for r in rows: print(' | '.join(r if links else r[:4]))
