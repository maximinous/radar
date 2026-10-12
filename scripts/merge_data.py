#!/usr/bin/env python3
"""Fusionne dans l'arbre de travail (main) les données d'une branche de veille : python3 scripts/merge_data.py <ref>.

Contrairement à une fusion git ligne à ligne, deux passages qui ajoutent chacun des articles ne créent pas de conflit :
- articles : union par id, tri du plus récent au plus ancien ; un article modifié sur la branche et inchangé sur main
  prend la version de la branche (passage d'enrichissement), sinon la version de main gagne ; un article présent
  au point de départ de la branche, retiré sur la branche et inchangé sur main est retiré (source jugée non fiable) ;
- sociétés : ajout des nouvelles ; une société modifiée sur la branche et inchangée sur main prend la version de la branche ;
- status : le lastRun le plus récent.
N'écrit que les fichiers qui changent. Affiche le nombre d'articles et de sociétés ajoutés.
"""
import json, os, subprocess, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ref = sys.argv[1]
D = 'radar-site/data/'

def load_ref(r, name):
    try: return json.loads(subprocess.check_output(['git', 'show', f'{r}:{D}{name}'], stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError: return None

def load(name): return json.load(open(D + name, encoding='utf-8'))

def save(name, data):
    # Même format que les fichiers existants : indent=1, UTF-8, sans retour à la ligne final.
    open(D + name, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1))

base = subprocess.check_output(['git', 'merge-base', 'HEAD', ref], text=True).strip()

arts, b_arts = load('articles.json'), load_ref(ref, 'articles.json') or []
base_arts = {a.get('id'): a for a in load_ref(base, 'articles.json') or []}
known = {a['id']: i for i, a in enumerate(arts)}
new_arts = [a for a in b_arts if a.get('id') not in known]
edited = 0
for a in b_arts:
    i = known.get(a.get('id'))
    if i is not None and a != arts[i] and arts[i] == base_arts.get(a['id']) and a != base_arts.get(a['id']):
        arts[i] = a; edited += 1
b_ids = {a.get('id') for a in b_arts}
removed = [a['id'] for a in arts if a['id'] in base_arts and a['id'] not in b_ids and a == base_arts[a['id']]] if b_arts else []
arts = [a for a in arts if a['id'] not in removed]
if new_arts or edited or removed:
    arts = sorted(arts + new_arts, key=lambda a: (a.get('date', ''), a.get('addedAt', '')), reverse=True)
    save('articles.json', arts)

cos, b_cos, base_cos = load('companies.json'), load_ref(ref, 'companies.json') or [], load_ref(base, 'companies.json') or []
by_id = {c['id']: c for c in base_cos}
idx = {c['id']: i for i, c in enumerate(cos)}
added_cos, changed = 0, False
for c in b_cos:
    if c['id'] not in idx:
        cos.append(c); added_cos += 1; changed = True
    elif c != cos[idx[c['id']]] and cos[idx[c['id']]] == by_id.get(c['id']) and c != by_id.get(c['id']):
        cos[idx[c['id']]] = c; changed = True
if changed: save('companies.json', cos)

st, b_st = load('status.json'), load_ref(ref, 'status.json')
if b_st and b_st.get('lastRun', '') > st.get('lastRun', ''): save('status.json', b_st)

print(f"{len(new_arts)} article(s) ajouté(s), {edited} enrichi(s), {len(removed)} retiré(s) et {added_cos} société(s) ajoutée(s) depuis {ref}")
