# Radar ROD Investment

Site statique de veille sur des sociétés non cotées, publié sur https://radar.rod-investment.fr via Cloudflare.

## Structure

- `radar-site/` : dossier publié par Cloudflare.
- `scripts/validate.py` : contrôle des données, à lancer avant chaque commit.
- `index.html` : la page (aucun serveur, aucune dépendance externe).
- `data/companies.json` : sociétés suivies (tableau d'objets `id`, `name`, `sector`, `order`, `oneLiner`, `description`, `hq`, `founded`, `leaders`, `website`, et `lastRound` facultatif : id de l'article de la dernière levée, affiché sur la fiche société ; `valuations` : liste de valorisations `{amount, value (en milliards), currency (USD ou EUR), round, date, dateLabel?, status: "officielle" | "presse", source: {label, url}}`, la fiche affiche la dernière officielle et, si elle est plus récente, la dernière rapportée par la presse ; `valuationNote` quand aucune n'est connue ; `metrics` : chiffres clés `{label, value, date, dateLabel?, status, source, articleId?}` ; `newsQuery` : requête Google News de la société).
- `data/articles.json` : articles, triés du plus récent au plus ancien.
- `data/status.json` : `{ "lastRun": "<ISO UTC>", "note": "<texte>" }`.
- `fonts/` : polices auto-hébergées (licence SIL OFL).
- `mentions-legales.html`, `_headers` (en-têtes HTTP Cloudflare).

## Format d'un article

```json
{
  "id": "mistral-ai-2026-09-21-pimento",
  "companyId": "mistral-ai",
  "date": "2026-09-21",
  "dateLabel": "Sept. 2026",
  "addedAt": "2026-09-24T10:10:00Z",
  "signal": "optimiste | neutre | prudent",
  "title": "…",
  "summary": "…",
  "detail": "… (paragraphes séparés par une ligne vide)",
  "impact": "…",
  "rationale": "…",
  "sources": [{ "label": "Média, date", "url": "https://…" }]
}
```

`date` = date de première publication publique de l'information (pas la date de l'événement). `dateLabel` est optionnel.

## Mise à jour

Après une modification de `app.js` ou `theme.js`, changer le paramètre `?v=` dans `index.html` pour que les navigateurs rechargent le script.

Pages de partage : `scripts/build_share.py` génère `radar-site/a/<id>.html` (articles) et `radar-site/s/<id>.html` (sociétés). Elles portent titre, résumé et signal dans leurs balises Open Graph (aperçu WhatsApp, LinkedIn, e-mail, image `radar-site/og/radar.png`) et redirigent vers le Radar. Le bouton « Copier le lien » donne ces adresses. Elles sont régénérées par `.github/workflows/veille-partage.yml` (poussée sur main) et par la fusion automatique.

Contrôle de couverture : `.github/workflows/veille-couverture.yml` lance chaque soir de semaine (19h45 UTC) `scripts/coverage.py 48`, qui lit les titres Google News (requêtes `newsQuery` de `companies.json`), garde ceux qui ressemblent à un événement et qu'aucun article ne couvre, et écrit `veille/candidats.md` et `veille/candidats.json`. Le passage du lendemain matin examine chaque piste.

La semaine du Radar : `#semaine` (semaine en cours) ou `#semaine/<lundi AAAA-MM-JJ>`, calculée dans la page à partir des articles et des valorisations ; export PDF.

Adresses partageables : `#<id d'article>` ouvre un article, `#societe/<id>` la fiche d'une société, `#comparer` le comparatif. Chaque article et chaque fiche s'exportent en PDF (mise en page d'impression dédiée dans `index.html`, `@media print`).

Une tâche planifiée ajoute les nouveaux articles du lundi au vendredi, deux fois par jour (8h et 14h, heure de Paris d'été ; passage complet le matin, passage léger limité aux nouveautés l'après-midi) et pousse son commit sur une branche `claude/<nom>` (le nom change quand la tâche est modifiée). Le workflow `.github/workflows/veille-auto-merge.yml` prend toute branche `claude/*` qui ne touche que `radar-site/data/`, fusionne ses données dans `main` avec `scripts/merge_data.py` (union des articles par id, `status.json` le plus récent), lance `scripts/validate.py`, pousse puis supprime la branche. Cloudflare redéploie automatiquement.

## Sécurité

Site 100 % statique. `radar-site/_headers` impose HTTPS (HSTS), une CSP stricte (uniquement les fichiers du site), et bloque l'intégration dans d'autres sites. `scripts/validate.py` refuse toute URL qui n'est pas en https, et côté page les liens sont filtrés (http/https uniquement) et tout le contenu est inséré comme texte.

Surveillance : `.github/workflows/veille-surveillance.yml` vérifie 1h30 après chaque passage que `data/status.json` a été mis à jour, et échoue sinon (e-mail GitHub). `scripts/validate.py` bloque aussi les doublons probables (même source, même société, 3 jours d'écart au plus, titres proches).
