# Development only. The repo is bind-mounted at /app, so this image holds just the tools.
FROM node:26-alpine
# Keep in step with packageManager in package.json.
RUN npm install --global pnpm@12.18.0
WORKDIR /app
