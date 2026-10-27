# UNEP/GRID stories, served as static files by nginx: the index at /, each
# story at /<slug>/. Unprivileged nginx on port 8080, health check /healthz.

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
# Whole tree at once: workspaces need every package.json, and a new story
# needs no change here.
COPY . .
RUN npm ci --no-audit --no-fund --ignore-scripts \
 && npm run build

FROM nginxinc/nginx-unprivileged:alpine-slim
LABEL org.opencontainers.image.title="unepgrid-stories" \
      org.opencontainers.image.description="UNEP/GRID-Geneva scroll stories, served at story.unepgrid.ch/<story>/" \
      org.opencontainers.image.licenses="MIT"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
