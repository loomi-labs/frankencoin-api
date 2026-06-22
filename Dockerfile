# syntax=docker/dockerfile:1.7
# Frankencoin API (NestJS) — production image.
# Build: docker build -t fc-api .
# Run:   docker run -d --name fc-api \
#          -e DATABASE_URL=postgres://... \
#          -e CONFIG_INDEXER_URL=http://ponder:42069 \
#          -e ALCHEMY_RPC_KEY=... \
#          -e COINGECKO_API_KEY=... \
#          -e THE_GRAPH_KEY=... \
#          -p 3030:3030 \
#          fc-api

# ---- deps ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# ---- builder ----
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=./prisma/schema
RUN yarn build

# ---- runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl tini
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 api

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Prisma client is generated at build time as root. Hand the directory
# to the runtime user so `prisma db push` can refresh it on schema changes
# without hitting EACCES.
RUN chown -R api:nodejs /app/node_modules/.prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER api
EXPOSE 3030
ENV PORT=3030

# DATABASE_URL, CONFIG_INDEXER_URL, ALCHEMY_RPC_KEY, COINGECKO_API_KEY,
# THE_GRAPH_KEY come from `docker run -e ...` at runtime — nothing baked in.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
