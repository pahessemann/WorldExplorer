# WorldExplorer

WorldExplorer est une PWA mobile d’exploration urbaine. Elle transforme chaque déplacement en progression : un cercle de 50 m révèle la carte autour de l’utilisateur, le trajet est enregistré et des cartes culturelles de ville se débloquent au fil des découvertes.

## Fonctionnalités

- Carte Leaflet en temps réel avec brouillard et zones circulaires dévoilées.
- Suivi GPS via `navigator.geolocation.watchPosition()` toutes les 5 secondes.
- Trajet courant, distance, vitesse moyenne, durée et nombre de zones.
- Historique des trajets avec réaffichage sur la carte.
- Collection de cartes de villes, défis, déblocage géolocalisé et emplacement QR.
- Propositions communautaires avec image et vote unique par appareil.
- Profil, statistiques, badges et progression.
- PWA installable avec cache hors ligne.
- Mode démo pour tester l’expérience sans partager sa position.

## Données et synchronisation

Les cercles, trajets et propositions sont d’abord enregistrés dans IndexedDB (`worldexplorer`). Cette stratégie offline-first permet de continuer à explorer sans réseau.

La synchronisation Supabase est automatique lorsque les deux variables de `.env.example` sont configurées. Le schéma prêt à exécuter se trouve dans `supabase/schema.sql` et contient les tables de zones, trajets, cartes et votes, la vue de popularité, les règles RLS et la validation automatique à 25 votes.

## Démarrage local

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`. Pour tester le vrai GPS sur mobile, utilisez une origine HTTPS ou `localhost`. Le bouton **Essai démo** anime un parcours parisien sans demander d’autorisation.

## Structure

```text
app/
  explorer-app.tsx   expérience complète et stockage IndexedDB
  sync.ts            synchronisation Supabase optionnelle
  globals.css        interface responsive
public/
  manifest.webmanifest
  sw.js
  og.png
supabase/
  schema.sql
```
