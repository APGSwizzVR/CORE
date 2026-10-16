FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4179 CORE_BIND_ADDRESS=0.0.0.0 CORE_DATA_DIR=/data
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 4179
CMD ["node", "server/standalone.cjs"]
