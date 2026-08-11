# WorldExplorer

WorldExplorer est une PWA mobile d’exploration urbaine. Chaque déplacement révèle un cercle de 50 mètres sur OpenStreetMap, alimente un trajet et peut débloquer des cartes culturelles de ville.

Le produit reprend la boucle d’exploration « fog of world » : marcher, révéler des fragments de carte, trouver des lieux mystérieux et compléter son journal. La progression ne peut pas être achetée : aucune énergie, aucun booster et aucune zone payante.

## Version exploitable

- GPS réel avec `watchPosition`, vitesse, boussole, distance et durée.
- Brouillard de guerre translucide : les villes et les routes OpenStreetMap restent lisibles.
- Trajets enregistrés, consultables sur la carte et exportables en JSON.
- Fonctionnement offline-first avec IndexedDB et file de synchronisation.
- Synchronisation anonyme par appareil dans Cloudflare D1.
- Cartes communautaires, vote unique, validation automatique à 25 votes.
- Images de propositions stockées dans Cloudflare R2.
- Déblocage d’une carte par proximité GPS, QR code ou défi de distance.
- PWA installable avec cache de l’application et des tuiles OpenStreetMap.
- Mode démo sans partage de position.

## Architecture

```text
app/
  explorer-app.tsx        interface et orchestration
  explorer/               géolocalisation, types, IndexedDB, Leaflet
  api/                     synchronisation, communauté, QR et images
  sync.ts                  file hors ligne et API cliente
db/
  schema.ts                schéma D1 avec Drizzle
drizzle/                   migrations SQL versionnées
public/
  sw.js                    cache PWA
  vendor/leaflet.js        moteur cartographique local
worker/
  index.ts                 worker Cloudflare
```

La progression privée est rattachée à un identifiant aléatoire généré et conservé dans le navigateur. Aucun compte n’est requis. Les données sont d’abord écrites dans IndexedDB, puis envoyées à D1 dès que la connexion revient.

## Démarrage local

Prérequis : Node.js 22.13 ou supérieur.

```bash
npm install
npm run db:generate
npm run dev
```

Ouvrez `http://localhost:3000`. La géolocalisation réelle nécessite HTTPS ou `localhost`.

## Validation

```bash
npm run lint
npm test
```

`npm test` compile la version de production puis vérifie les invariants de persistance, de synchronisation et de dévoilement.
