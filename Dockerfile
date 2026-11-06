# WorshipHQ for Google Cloud Run. The Vercel site does not use this file.
# Build with BuildKit and pass the production settings as a secret named "envfile" (a .env style file):
#   docker build --secret id=envfile,src=prod.env -t worshiphq .
# The settings are used while building (the site reads the database and NEXT_PUBLIC_ values at build time) and are
# never written into the image: the file is copied in, used and deleted inside one step.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=envfile \
    cp /run/secrets/envfile .env.production \
    && npx prisma generate \
    && npx next build \
    ; status=$? ; rm -f .env.production ; exit $status

FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
