# UNEP/GRID stories, served as static files by static-web-server: the index at /,
# each story at /<slug>/. Port 8080, health check /healthz.

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
# Whole tree at once: workspaces need every package.json, and a new story
# needs no change here.
COPY . .
RUN npm ci --no-audit --no-fund --ignore-scripts \
 && npm run build

# static-web-server: a single memory-safe (Rust) binary on an empty base,
# run as "nobody". Config in docker/sws.toml.
FROM joseluisq/static-web-server:2
LABEL org.opencontainers.image.title="unepgrid-stories" \
      org.opencontainers.image.description="UNEP/GRID-Geneva scroll stories, served at story.unepgrid.ch/<story>/" \
      org.opencontainers.image.licenses="MIT"
COPY docker/sws.toml /sws.toml
COPY docker/healthz /public/healthz
COPY --from=build /src/dist /public
USER 65534:65534
EXPOSE 8080
CMD ["--config-file", "/sws.toml"]
