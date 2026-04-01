FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api-server/package.json packages/api-server/package.json
COPY prisma/schema.prisma prisma/schema.prisma

RUN npm ci

COPY packages/shared packages/shared
COPY packages/api-server packages/api-server
COPY prisma prisma

RUN npm run build --workspace @marketpos/shared \
  && npm run build --workspace @marketpos/api-server \
  && npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api-server ./packages/api-server
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "packages/api-server/dist/server.js"]

