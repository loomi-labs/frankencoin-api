#!/bin/sh
set -e

# Sync the Prisma schema with the database before starting the app.
# Mirrors what the upstream migrate.sh does (`yarn prisma:push`):
# the repo has no versioned migrations directory, so `db push` is
# the supported approach. Idempotent on re-runs.
if [ "${DISABLE_DATABASE:-false}" != "true" ]; then
    echo "→ Running prisma db push"
    npx prisma db push --schema=./prisma/schema --accept-data-loss
fi

exec "$@"
