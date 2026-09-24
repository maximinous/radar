# Radar ROD Investment

Site statique de veille sur des sociétés non cotées, publié sur https://radar.rod-investment.fr via Cloudflare.

## Structure

- `radar-site/` : dossier publié par Cloudflare.
- `scripts/validate.py` : contrôle des données, à lancer avant chaque commit.
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

Une tâche planifiée ajoute les nouveaux articles trois fois par jour (8h, 13h, 18h, heure de Paris d'été ; passage complet le matin, passages légers limités aux nouveautés ensuite) et pousse son commit sur une branche `claude/<nom>` (le nom change quand la tâche est modifiée). Le workflow `.github/workflows/veille-auto-merge.yml` prend toute branche `claude/*` qui ne touche que `radar-site/data/`, lance `scripts/validate.py`, fusionne dans `main` puis supprime la branche. Cloudflare redéploie automatiquement.

## Sécurité

Site 100 % statique. `radar-site/_headers` impose HTTPS (HSTS), une CSP stricte (uniquement les fichiers du site), et bloque l'intégration dans d'autres sites. `scripts/validate.py` refuse toute URL qui n'est pas en https, et côté page les liens sont filtrés (http/https uniquement) et tout le contenu est inséré comme texte.

Surveillance : `.github/workflows/veille-surveillance.yml` vérifie 1h30 après chaque passage que `data/status.json` a été mis à jour, et échoue sinon (e-mail GitHub). `scripts/validate.py` bloque aussi les doublons probables (même source, même société, 3 jours d'écart au plus, titres proches).
