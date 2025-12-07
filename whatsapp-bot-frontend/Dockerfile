# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm install; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; else npm install; fi
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY public/config.js /usr/share/nginx/html/config.template.js
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
