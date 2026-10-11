# Ma Tontine

MVP React + TypeScript pour créer, sauvegarder, rouvrir et modifier une tontine, calculer son échéancier et ouvrir une version HTML optimisée pour l’impression ou l’enregistrement en PDF depuis le navigateur.

## Installation

```bash
npm install
npx netlify dev
```

`netlify dev` lance ensemble Vite et la fonction de sauvegarde locale.

## Stockage

Les tontines sont enregistrées avec Netlify Blobs par une fonction serveur. Le code d’accès n’est jamais stocké en clair : son empreinte SHA-256 sert de clé. L’API ne fournit aucune route permettant de lister les tontines.

## Vérification

```bash
npm run typecheck
npm test
npm run build
```

## Déploiement Netlify

Le fichier `netlify.toml` configure la construction, le dossier `dist`, la fonction serveur, sa route `/api/tontines` et le repli SPA. Reliez simplement le dépôt GitHub dans Netlify ou lancez `npx netlify deploy --prod`.

Aucune variable d’environnement et aucun projet Supabase ne sont nécessaires.
