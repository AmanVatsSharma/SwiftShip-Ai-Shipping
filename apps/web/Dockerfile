# Multi-stage build for Next.js web app
FROM node:22-alpine AS deps

# Install OpenSSL
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build stage
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx nx build web

# Runner stage
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S node -u 1001

WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Copy standalone output
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

# Set non-root user
USER node

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "server.js"]