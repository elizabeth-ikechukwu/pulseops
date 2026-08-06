# backend/Dockerfile
# Production-standard Node image:
#  - pinned minor version, alpine for size
#  - npm ci (lockfile-exact, reproducible) with dev deps omitted
#  - runs as the non-root 'node' user
#  - dumb-init as PID 1 so SIGTERM actually reaches node (graceful shutdown)
#  - HEALTHCHECK wired to /healthz

FROM node:20-alpine

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

# Copy manifests first so 'npm ci' is cached until dependencies change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# chown so the runtime user owns the files
COPY --chown=node:node . .

USER node

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
