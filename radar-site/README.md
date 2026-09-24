# Radar ROD Investment

Site statique de veille sur des sociétés non cotées, publié sur https://radar.rod-investment.fr via Cloudflare.

## Structure

- `index.html` : la page (aucun serveur, aucune dépendance externe).
- `data/companies.json` : sociétés suivies (tableau d'objets `id`, `name`, `sector`, `order`, `oneLiner`, `description`, `hq`, `founded`, `leaders`, `website`).
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

Une tâche planifiée ajoute les nouveaux articles trois fois par jour (8h, 13h, 18h, heure de Paris) et pousse le commit sur `main`. Cloudflare redéploie automatiquement.
