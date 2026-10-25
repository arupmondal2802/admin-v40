# ==============================================================================
# Multi-Stage Production Dockerfile for A Big Engine Backend / Full-Stack
# Optimized for minimal image size (<150MB), security, and high performance
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build stage
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# Copy application source code
COPY . .

# Run the build (generates dist/server.cjs and static assets in dist/)
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production runtime stage
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Set default production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies to keep the image lightweight
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled build output from the builder stage
COPY --from=builder /app/dist ./dist

# Copy public assets if available
COPY --from=builder /app/public ./public

# Expose server port (Render & Cloud Run will dynamically inject their own $PORT)
EXPOSE 3000

# Run container as a non-privileged user for security
USER node

# Container Health Check (verifies Express is responding)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

# Launch the compiled CommonJS server bundle
CMD ["node", "dist/server.cjs"]
