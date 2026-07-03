#!/bin/bash
set -e

if [ -n "$DATABASE_URL" ]; then
  TARGET_DB="$DATABASE_URL"
  DUMP_FILE="${1:-}"
else
  TARGET_DB="${1:-}"
  DUMP_FILE="${2:-}"
fi

if [ -z "$TARGET_DB" ] || [ -z "$DUMP_FILE" ]; then
  echo "Usage: DATABASE_URL=postgresql://... yarn prisma:restore <dump-file>"
  echo "   or: yarn prisma:restore postgresql://... <dump-file>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DUMP_PATH="${SCRIPT_DIR}/${DUMP_FILE}"

if [ ! -f "$DUMP_PATH" ]; then
  echo "Error: dump file not found: prisma/backup/${DUMP_FILE}"
  exit 1
fi

echo "Restoring prisma/backup/${DUMP_FILE} to target database..."
echo "WARNING: This will overwrite existing data."
read -p "Proceed? [y/N] " confirm
if [ "$(echo "$confirm" | tr '[:upper:]' '[:lower:]')" != "y" ]; then
  echo "Aborted."
  exit 0
fi

docker run --rm \
  -v "${SCRIPT_DIR}:/backup" \
  postgres:18.4 \
  pg_restore \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    -d "$TARGET_DB" \
    "/backup/${DUMP_FILE}"

echo "Done."
