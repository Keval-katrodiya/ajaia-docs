# Single-stage-per-concern build. Kept deliberately plain: this app is one
# Next.js server and one SQLite file, and the Dockerfile should say so.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies are kept: tsx runs the seed script at container start.
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Point at a mounted volume so documents survive a redeploy. Without a volume
# the app still runs - the database is recreated and reseeded on each boot.
ENV DATABASE_PATH=/data/app.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/samples ./samples
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/next.config.ts ./next.config.ts

VOLUME /data
EXPOSE 3000

# Seeding is idempotent, so this is safe on every restart.
CMD ["sh", "-c", "npx tsx scripts/seed.ts && npx next start -p ${PORT:-3000} -H 0.0.0.0"]
