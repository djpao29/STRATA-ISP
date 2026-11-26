# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
# Prisma necesita OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .
RUN npx prisma generate && npx next build

# Imagen de herramientas: migraciones (npm run db:deploy) y alta inicial (npm run setup).
FROM builder AS tools
CMD ["npm", "run", "db:deploy"]

# Imagen final: solo el servidor autocontenido de Next.
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# --openssl-legacy-provider: muchas OLT usan SNMP v3 con cifrado DES, que OpenSSL 3 deshabilita por defecto.
CMD ["node", "--openssl-legacy-provider", "server.js"]
