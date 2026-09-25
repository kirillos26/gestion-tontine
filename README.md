# Ma Tontine

MVP React + TypeScript pour créer, sauvegarder, rouvrir et modifier une tontine, calculer son échéancier et ouvrir une version HTML optimisée pour l’impression ou l’enregistrement en PDF depuis le navigateur.

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

## Configuration Supabase

1. Créez un projet sur Supabase.
2. Exécutez [`supabase/schema.sql`](supabase/schema.sql) dans l’éditeur SQL.
3. Copiez l’URL du projet et la clé publique `anon` dans `.env`.

N’utilisez jamais la clé `service_role` côté navigateur. La table n’a aucune politique publique : les trois fonctions RPC vérifient le code d’accès haché et empêchent la liste des tontines.

## Vérification

```bash
npm run typecheck
npm test
npm run build
```

## Déploiement GitHub Pages

Le projet utilise une base Vite relative, compatible avec un sous-répertoire GitHub Pages.

```bash
npm run deploy
```

Dans GitHub, choisissez ensuite la branche `gh-pages` comme source de Pages. Ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` à l’environnement de build si vous automatisez le déploiement.
