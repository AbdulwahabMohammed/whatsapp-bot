FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY migrations ./migrations
COPY views ./views
COPY public ./public

EXPOSE 3001
CMD ["node", "src/admin.js"]
