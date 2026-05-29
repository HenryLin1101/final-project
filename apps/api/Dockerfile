# docker build -f apps/api/Dockerfile .
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps ./apps
# NOTE: --no-frozen-lockfile so the image build regenerates the lockfile when
# package.json adds deps (e.g. BullMQ) and the committed lockfile is stale.
RUN pnpm install --no-frozen-lockfile \
  && pnpm --filter api exec prisma generate \
  && pnpm --filter api build
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
