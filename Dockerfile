# Build stage
FROM cgr.dev/chainguard/wolfi-base@sha256:1c56f3ceb1c9929611a1cc7ab7a5fde1ec5df87add282029cd1596b8eae5af67 AS base

# Install Node.js and enable pnpm
RUN apk update && apk add --no-cache nodejs-25 npm && npm install -g corepack && corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

FROM base AS builder

WORKDIR /app

# Copy package files and .npmrc
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./

# Install dependencies with cache mount
RUN --mount=type=secret,id=NODE_AUTH_TOKEN \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    printf '//npm.pkg.github.com/:_authToken=%s\n@navikt:registry=https://npm.pkg.github.com\n' "$(cat /run/secrets/NODE_AUTH_TOKEN)" > $HOME/.npmrc \
    && pnpm install --frozen-lockfile \
    && rm -f $HOME/.npmrc

# Copy source code and build
COPY . .
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
RUN pnpm run build

# Production stage
FROM cgr.dev/chainguard/wolfi-base@sha256:1c56f3ceb1c9929611a1cc7ab7a5fde1ec5df87add282029cd1596b8eae5af67 AS runtime

RUN apk update && apk add --no-cache nodejs-25

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./

RUN apk add --no-cache npm && npm install -g corepack && corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN --mount=type=secret,id=NODE_AUTH_TOKEN \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    printf '//npm.pkg.github.com/:_authToken=%s\n@navikt:registry=https://npm.pkg.github.com\n' "$(cat /run/secrets/NODE_AUTH_TOKEN)" > $HOME/.npmrc \
    && pnpm install --prod --frozen-lockfile \
    && rm -f $HOME/.npmrc

RUN apk del npm

# Copy built assets and runtime files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/src/data ./src/data
COPY --from=builder /app/.nais ./.nais

EXPOSE 8080

CMD ["node", "server.js"]
