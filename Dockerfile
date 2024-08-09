# Base Image
FROM node:20.15-slim AS base
WORKDIR /uninbox

# Pnpm Cache
FROM base AS pnpm-cache
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1
RUN corepack enable

# Root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Packages
COPY /packages/database/package.json ./packages/database/package.json
COPY /packages/eslint-plugin/package.json ./packages/eslint-plugin/package.json
COPY /packages/hono/package.json ./packages/hono/package.json
COPY /packages/otel/package.json ./packages/otel/package.json
COPY /packages/realtime/package.json ./packages/realtime/package.json
COPY /packages/tiptap/package.json ./packages/tiptap/package.json
COPY /packages/utils/package.json ./packages/utils/package.json

# Apps
COPY /apps/mail-bridge/package.json ./apps/mail-bridge/package.json
COPY /apps/platform/package.json ./apps/platform/package.json
COPY /apps/storage/package.json ./apps/storage/package.json
COPY /apps/web/package.json ./apps/web/package.json
COPY /apps/worker/package.json ./apps/worker/package.json

# EE Apps
COPY /ee/apps/billing/package.json ./ee/apps/billing/package.json
COPY /ee/apps/command/package.json ./ee/apps/command/package.json

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

# Distribute UnBundled Modules
FROM pnpm-cache AS isolated_modules
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy --prod --frozen-lockfile --ignore-scripts --filter=@u22n/platform /modules/platform
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy --prod --frozen-lockfile --ignore-scripts --filter=@u22n/mail-bridge /modules/mail-bridge
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy --prod --frozen-lockfile --ignore-scripts --filter=@u22n/storage /modules/storage
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy --prod --frozen-lockfile --ignore-scripts --filter=@u22n/worker /modules/worker
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm deploy --prod --frozen-lockfile --ignore-scripts --filter=@uninbox-ee/billing /modules/ee-billing

# Build everything
FROM pnpm-cache AS builder
ENV DOCKER_BUILD=1
COPY . .
RUN --mount=type=cache,id=turbo,target=./.turbo pnpm run build:all
RUN --mount=type=cache,id=turbo,target=./.turbo pnpm run ee:build:all
RUN rm -rf ./**/.turbo

# Create the web Container
FROM base AS web
WORKDIR /uninbox
COPY --from=pnpm-cache /uninbox/apps/web/package.json .
COPY --from=builder /uninbox/apps/web/.next/standalone .next/standalone
ENV HOSTNAME=0.0.0.0
CMD node .next/standalone/apps/web/server.js

# Create platform Container
FROM base AS platform
WORKDIR /uninbox
COPY --from=isolated_modules /modules/platform .
COPY --from=builder /uninbox/apps/platform/.output .output
CMD node --import ./.output/tracing.js .output/app.js

# Create mail-bridge Container
FROM base AS mail-bridge
WORKDIR /uninbox
COPY --from=isolated_modules /modules/mail-bridge .
COPY --from=builder /uninbox/apps/mail-bridge/.output .output
CMD node --import ./.output/tracing.js .output/app.js

# Create storage Container
FROM base AS storage
WORKDIR /uninbox
COPY --from=isolated_modules /modules/storage .
COPY --from=builder /uninbox/apps/storage/.output .output
CMD node --import ./.output/tracing.js .output/app.js

# Create worker Container
FROM base AS worker
WORKDIR /uninbox
COPY --from=isolated_modules /modules/worker .
COPY --from=builder /uninbox/apps/worker/.output .output
CMD node --import ./.output/tracing.js .output/app.js

# Create the ee-command Container
FROM base AS ee-command
WORKDIR /uninbox
COPY --from=pnpm-cache /uninbox/ee/apps/command/package.json .
COPY --from=builder /uninbox/ee/apps/command/.next/standalone .next/standalone
ENV HOSTNAME=0.0.0.0
CMD node .next/standalone/ee/apps/command/server.js

# Create ee-billing Container
FROM base AS ee-billing
WORKDIR /uninbox
COPY --from=isolated_modules /modules/ee-billing .
COPY --from=builder /uninbox/ee/apps/billing/.output .output
CMD node .output/app.js