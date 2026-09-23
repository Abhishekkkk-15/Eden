# ==============================================================================
# Multi-stage Dockerfile for Eden AI Workspace
# Includes static FFmpeg/FFprobe and serves both Backend API and Frontend SPA
# ==============================================================================

# ----------------------------------------------------
# Stage 1: Static FFmpeg & FFprobe binaries
# ----------------------------------------------------
FROM mwader/static-ffmpeg:7.1 AS ffmpeg-source

# ----------------------------------------------------
# Stage 2: Build frontend and backend
# ----------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install pnpm (matching lockfile version 9)
RUN npm install -g pnpm@9

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY packages/db/package.json ./packages/db/
COPY packages/integrations-cloudinary-ai-server/package.json ./packages/integrations-cloudinary-ai-server/
COPY packages/integrations-groq-ai-server/package.json ./packages/integrations-groq-ai-server/
COPY packages/integrations-openai-ai-server/package.json ./packages/integrations-openai-ai-server/
COPY apps/api-server/package.json ./apps/api-server/
COPY apps/eden/package.json ./apps/eden/

# Install dependencies (use --no-frozen-lockfile to avoid platform/version override discrepancies)
RUN pnpm install --no-frozen-lockfile

# Copy project source code
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api-server/ ./apps/api-server/
COPY apps/eden/ ./apps/eden/

# Set build-time environment variables
ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PORT=3000

# Build Frontend (SPA)
RUN pnpm --filter @workspace/eden build

# Build Backend (API Server)
RUN pnpm --filter @workspace/api-server build

# ----------------------------------------------------
# Stage 3: Production runtime image
# ----------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install essential system utilities and CA certificates
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy FFmpeg and FFprobe static binaries from stage 1
COPY --from=ffmpeg-source /ffmpeg /ffprobe /usr/local/bin/
RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Verify FFmpeg installation
RUN ffmpeg -version && ffprobe -version

# Setup production environment
ENV NODE_ENV=production
ENV PORT=10000

# Create uploads directory for media processing
RUN mkdir -p /app/apps/api-server/uploads

# Copy package manifests and workspace structure
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/api-server/package.json ./apps/api-server/

# Copy built backend bundle
COPY --from=builder /app/apps/api-server/dist ./apps/api-server/dist

# Copy built frontend assets to api-server/public for single-server SPA hosting
COPY --from=builder /app/apps/eden/dist/public ./apps/api-server/public

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api-server/node_modules ./apps/api-server/node_modules

WORKDIR /app/apps/api-server

# Expose Render default port (Render injects $PORT at runtime)
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start server
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
