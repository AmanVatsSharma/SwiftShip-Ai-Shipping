# Multi-stage build for NestJS API
FROM node:22-alpine AS build

# Install dependencies
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build the app
RUN npx nx build api --prod

# Prune dependencies
FROM node:22-alpine AS prune

WORKDIR /app
COPY package*.json ./
RUN npm ci
RUN npm prune --production

# Runtime stage
FROM node:22-alpine AS runtime

# Install OpenSSL for Prisma/TypeORM
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S node -u 1001

WORKDIR /app

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy built application and dependencies
COPY --from=build /dist/apps/api ./dist/apps/api
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/package.json ./package.json

# Set non-root user
USER node

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health/ready || exit 1

# Start the application
CMD ["node", "dist/apps/api/main.js"]