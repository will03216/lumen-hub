FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg libc6-compat python3 py3-pip \
    && pip install --no-cache-dir --break-system-packages yt-dlp

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are embedded into the client bundle at build time.
# Pass them via --build-arg so they are baked in correctly.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CDN_BASE
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/onboarding
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/sign-in
# Smart Video Edit's feature flag. It MUST be a build arg, not just a runtime
# env: Next inlines NEXT_PUBLIC_* at compile time, so a value supplied only to
# the running container is invisible to the already-built bundle and the
# feature stays dark with no error to explain why.
ARG NEXT_PUBLIC_VIDEO_EDIT=
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CDN_BASE=$NEXT_PUBLIC_CDN_BASE
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL
ENV NEXT_PUBLIC_VIDEO_EDIT=$NEXT_PUBLIC_VIDEO_EDIT
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# /api/library/mirror streams BytePlus CDN assets to public/library-cache at
# runtime so the Library survives the signed URLs expiring. COPY leaves
# /app/public owned by root, and the container drops to `nextjs` below — so
# every write failed with EACCES and the route answered 502 "stream failed".
# Own the directory before dropping privileges.
RUN mkdir -p /app/public/library-cache \
 && chown -R nextjs:nodejs /app/public/library-cache

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
