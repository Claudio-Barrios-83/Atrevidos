# ============================================================================
# ATREVIDOS - Dockerfile (Multi-stage build)
# ============================================================================

# ---- Stage 1: Install dependencies & build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Variables PUBLIC_/VITE_ necesarias en tiempo de build: SvelteKit
# ($env/static/public) y Vite (import.meta.env) las inlinean en el bundle del
# cliente durante "vite build". No son secretas (la anon key está diseñada
# para exponerse en el navegador), pero no viven en la imagen vía COPY porque
# .env está en .dockerignore; se inyectan explícitamente como build args.
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV PUBLIC_SUPABASE_URL=${PUBLIC_SUPABASE_URL}
ENV PUBLIC_SUPABASE_ANON_KEY=${PUBLIC_SUPABASE_ANON_KEY}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

# Build the app
RUN npm run build

# ---- Stage 2: Production server ----
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Copy only the built output and production dependencies
COPY --from=builder /app/build build/
COPY --from=builder /app/package.json .
COPY --from=builder /app/node_modules node_modules/

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["node", "build"]
