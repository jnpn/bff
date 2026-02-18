# Dockerfile
FROM node:24-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 proxyuser

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=proxyuser:nodejs src/proxy.cjs ./
COPY --chown=proxyuser:nodejs package*.json ./

# Switch to non-root user
USER proxyuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/__interceptors', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Environment variables
ENV NODE_ENV=production \
    PORT=3000

# Start the application
CMD ["node", "proxy.cjs"]
