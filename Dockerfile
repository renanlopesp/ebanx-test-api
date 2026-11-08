FROM oven/bun:1.4.3 AS bun

FROM node:26-bookworm-slim AS base
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

FROM base AS build
COPY package.json bun.lock ./
COPY .husky/install.mjs ./.husky/install.mjs
RUN HUSKY=0 bun install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN bun run build

FROM base AS production-dependencies
COPY package.json bun.lock ./
COPY .husky/install.mjs ./.husky/install.mjs
RUN HUSKY=0 bun install --frozen-lockfile --production

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
