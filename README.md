## Frankencoin API

### Setup

```bash
yarn install
cp .env.example .env   # fill in values
```

### Development

```bash
yarn infra:up   # start local docker stack
yarn dev        # install deps + watch mode
```

### NPM package

```bash
# bump version in package.json first
npm login
yarn npm:build
yarn npm:publish
```

### Database

```bash
# apply schema to deployment db (e.g. Railway)
DATABASE_URL=postgresql://... yarn prisma:push

# run a migration script
DATABASE_URL=postgresql://... yarn migrate:subscriptions
```

### DB backup / restore

```bash
# dump to prisma/backup/
DATABASE_URL=postgresql://... yarn prisma:backup

# restore a dump from prisma/backup/
DATABASE_URL=postgresql://... yarn prisma:restore backup_2026-06-24_12-00-00.dump
```

### Environment variables

```
PORT=3030

CONFIG_APP_URL=https://app.frankencoin.com
CONFIG_INDEXER_URL=https://ponder.frankencoin.com
CONFIG_BACKUP_INDEXER_URL=https://ponder.frankencoin.com

# Database configuration (optional - set DISABLE_DATABASE=true to skip)
DATABASE_URL=postgresql://user:password@localhost:5432/frankencoin
DISABLE_DATABASE=false

ALCHEMY_RPC_KEY=...
COINGECKO_API_KEY=CG-...
TELEGRAM_BOT_NAME=...
TELEGRAM_BOT_TOKEN=...
JWT_SECRET=...
THE_GRAPH_KEY=...
```

MIT licensed.
