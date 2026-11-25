# Surfbird — Kitesurf engine, self-hosted.
# Full in-image build: clones upstream at KITESURF_REF and compiles with Bazel.
# Requires ~4GB+ RAM and good network for the builder stage (CI machines).
# For low-resource hosts use Dockerfile.prebuilt with a locally-built checkout.
# syntax=docker/dockerfile:1

# pinned upstream commit — bump deliberately, test, tag. pass --build-arg KITESURF_REF=main to track head.
ARG KITESURF_REF=4a2903813a22b08d4f3cc64a4b35339d0293a5d1
ARG NODE_IMAGE=node:22-bookworm-slim
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG GH_PREFIX=
# MIRRORS=1 enables the China-network overrides (bazel downloader rewrites +
# crates.io → USTC). Leave unset on normal networks — rewrites would add an
# unnecessary detour and the fallback ordering is only a safety net.
ARG MIRRORS=0
ARG BAZEL_JOBS=
ARG BAZELISK_VERSION=v1.30.0

# ---------- builder: clone upstream, apply patches, bazel build ----------
FROM ${NODE_IMAGE} AS builder
ARG KITESURF_REF NPM_REGISTRY GH_PREFIX MIRRORS BAZEL_JOBS BAZELISK_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl build-essential python3 unzip zip \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.4 --registry=${NPM_REGISTRY}
# NOTE: images are linux/amd64 only — bazelisk binary is hardcoded amd64 and CI
# builds on an amd64 runner. Arm hosts run via emulation (slow) or not at all.
RUN curl -fsSL ${GH_PREFIX}https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-amd64 \
      -o /usr/local/bin/bazel \
    && curl -fsSL ${GH_PREFIX}https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-amd64.sha256 \
      -o /tmp/bazelisk.sha256 \
    && echo "$(cut -d' ' -f1 /tmp/bazelisk.sha256)  /usr/local/bin/bazel" | sha256sum -c - \
    && chmod +x /usr/local/bin/bazel

WORKDIR /build
# validate KITESURF_REF before it hits a shell-expanded git invocation —
# a value containing spaces or a leading '-' would inject extra arguments.
RUN git clone --depth 1 ${GH_PREFIX}https://github.com/cloudflare/kitesurf.git . \
    && case "$KITESURF_REF" in \
         *[!A-Za-z0-9._/-]*|-*|"") echo "invalid KITESURF_REF: $KITESURF_REF" >&2; exit 1 ;; \
       esac \
    && (git fetch --depth 1 origin "${KITESURF_REF}" && git checkout FETCH_HEAD || git checkout "${KITESURF_REF}") \
    && git rev-parse HEAD

# escape hatch: drop .patch files into patches/ to modify the engine.
# a patch that doesn't apply must fail the build — never ship an unpatched engine silently.
COPY patches/ /build/patches/
RUN for p in patches/*.patch; do \
      [ -e "$p" ] || continue; \
      echo "applying $p"; git apply --check "$p" && git apply "$p"; \
    done

# optional China-network overrides — rewrite rules live in bazel-downloader.cfg.
COPY bazel-downloader.cfg /build/bazel-downloader.cfg
RUN if [ "$MIRRORS" = "1" ]; then \
      printf 'common --downloader_config=/build/bazel-downloader.cfg\n' > .bazelrc.user && \
      mkdir -p /root/.cargo && \
      printf '[source.crates-io]\nreplace-with = "ustc"\n\n[source.ustc]\nregistry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"\n' \
        > /root/.cargo/config.toml ; \
    else touch .bazelrc.user; fi; \
    if [ -n "$BAZEL_JOBS" ]; then echo "build --jobs=$BAZEL_JOBS" >> .bazelrc.user; fi

RUN pnpm config set registry ${NPM_REGISTRY} && pnpm install --frozen-lockfile
# bazelisk downloads bazel itself from here — honor GH_PREFIX like every other
# github fetch so MIRRORS=1 builds behind a mirror prefix don't stall on it.
ARG BAZELISK_BASE_URL=${GH_PREFIX}https://github.com/bazelbuild/bazel/releases/download
ENV BAZELISK_BASE_URL=${BAZELISK_BASE_URL}
RUN pnpm run build

# materialize a clean runtime tree: artifacts staged by dev_build live in-tree,
# node_modules are already installed — skip .git and bazel-* output symlinks.
RUN mkdir /out && tar -C /build --exclude='./.git' --exclude='./bazel-*' -cf - . | tar -C /out -xf -

# ---------- runtime base ----------
FROM ${NODE_IMAGE} AS runtime-base
# OCI metadata — Docker Hub has no source-repo field for community images;
# these labels are how scanners/registries/LLM tooling find the repo.
LABEL org.opencontainers.image.title="surfbird" \
      org.opencontainers.image.description="Unofficial self-hosted Cloudflare Kitesurf headless browser for AI agents" \
      org.opencontainers.image.url="https://hub.docker.com/r/terry2010/surfbird" \
      org.opencontainers.image.source="https://github.com/terry2010/surfbird" \
      org.opencontainers.image.documentation="https://github.com/terry2010/surfbird#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production
# node slim ships no system CA bundle — node bundles its own roots, but workerd
# (KJ TLS) reads /etc/ssl/certs and can't fetch any HTTPS site without them.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/proxy
COPY proxy/package.json proxy/package-lock.json ./
RUN npm ci --omit=dev --registry=${NPM_REGISTRY}
COPY proxy/ ./

WORKDIR /app/kitesurf
COPY --from=builder /out ./

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# run unprivileged — the engine spends its life rendering hostile pages
RUN chown -R node:node /app
ENV HOME=/home/node
USER node

ENTRYPOINT ["/entrypoint.sh"]

# ---------- targets ----------
# engine has no /health route — probe the CDP discovery endpoint instead.
FROM runtime-base AS raw
ENV SURFBIRD_MODE=raw
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/json/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

FROM runtime-base AS auth
ENV SURFBIRD_MODE=auth
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SURFBIRD_PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
