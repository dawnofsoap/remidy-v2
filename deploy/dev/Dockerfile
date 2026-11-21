# Development only. The repo is bind-mounted at /app, so this image holds just the tools.
# Pinned like deploy/Dockerfile, so a new Node release arrives in one Dependabot pull request for both.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
# Keep in step with packageManager in package.json.
RUN npm install --global pnpm@12.18.0
WORKDIR /app
