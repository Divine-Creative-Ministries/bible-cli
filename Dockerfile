# bible-cli hosted MCP endpoint: stateless, read-only, databases baked in.
# Build:  docker build -t bible-mcp .
# Run:    docker run -p 8080:8080 bible-mcp

# deps: production node_modules (better-sqlite3 may compile — needs toolchain)
FROM node:22 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --build-from-source

# build: TypeScript -> dist
FROM node:22 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# runtime: slim image, compiled deps + dist + baked databases
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production BIBLE_CLI_DATA=/data PORT=8080
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Bake the scripture databases into the image (checksum-verified downloads
# from the pinned data release). ~285 MB — the whole point: no runtime state.
RUN node dist/cli.js db download && node dist/cli.js db download-lxx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/cli.js", "mcp", "--http"]
