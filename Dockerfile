# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY src/ ./src
RUN npm ci && npm run build

# Run stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "/app/dist/index.js"]
