# docker build -f apps/web/Dockerfile .
FROM node:20-bookworm-slim
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
ENV PORT=3001
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps ./apps
# NOTE: --no-frozen-lockfile so the image build regenerates the lockfile when
# package.json adds deps and the committed lockfile is stale.
RUN pnpm install --no-frozen-lockfile \
  && pnpm --filter web build
WORKDIR /app/apps/web
EXPOSE 3001
CMD ["pnpm", "exec", "next", "start", "-p", "3001"]
