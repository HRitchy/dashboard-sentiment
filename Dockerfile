# syntax=docker/dockerfile:1.7

# ------------------------------------------------------------
# 1) deps — install production + build dependencies only
# ------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# libc6-compat is required by some Next.js native deps on Alpine.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------
# 2) builder — compile the app with `next build`
# ------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ------------------------------------------------------------
# 3) runner — minimal image that only runs the standalone server
# ------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy the standalone build output + static assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# The standalone output generates a server.js entry point at the root.
CMD ["node", "server.js"]
