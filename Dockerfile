# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin sriyan

COPY --from=prod-deps --chown=sriyan:sriyan /app/package.json /app/package-lock.json ./
COPY --from=prod-deps --chown=sriyan:sriyan /app/node_modules ./node_modules
COPY --from=build --chown=sriyan:sriyan /app/dist ./dist

USER sriyan
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
