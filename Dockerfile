# Build stage
FROM cgr.dev/chainguard/wolfi-base@sha256:05d24163df148be377275af8374c16523a1dc7e19bf4f1c689784791553c5e45 AS base

# Install Node.js and enable pnpm
RUN apk update && apk add --no-cache nodejs-24 npm && npm install -g corepack && corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

FROM base AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
RUN pnpm run build

# Production stage
FROM cgr.dev/chainguard/wolfi-base@sha256:05d24163df148be377275af8374c16523a1dc7e19bf4f1c689784791553c5e45 AS runtime

RUN apk update && apk add --no-cache nodejs-24

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

RUN apk add --no-cache npm && npm install -g corepack && corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# @navikt/oasis (and its dep @navikt/texas) only exist on GitHub Packages, so they are
# not in package.json/lockfile; external contributors can then install without a token.
# The server falls back to a local user when oasis is missing (see authUtils.js).
ARG OASIS_VERSION=4.1.1
RUN --mount=type=secret,id=NODE_AUTH_TOKEN \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile \
    && printf '//npm.pkg.github.com/:_authToken=%s\n@navikt:registry=https://npm.pkg.github.com\n' "$(cat /run/secrets/NODE_AUTH_TOKEN)" > $HOME/.npmrc \
    && pnpm add --prod --save-exact "@navikt/oasis@${OASIS_VERSION}" \
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
