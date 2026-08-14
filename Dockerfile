# syntax=docker/dockerfile:1

# ---------- frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ---------- backend ----------
FROM golang:1.22-alpine AS backend
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY backend/go.mod backend/go.sum* ./
RUN go mod download || true
COPY backend/ ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} go build \
  -ldflags="-s -w -X main.Version=${VERSION}" \
  -o /out/onenav ./cmd/server

# ---------- runtime (single image) ----------
FROM alpine:3.20
ARG VERSION=dev
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata \
  && adduser -D -H -u 1000 onenav \
  && mkdir -p /data \
  && chown -R onenav:onenav /app /data
COPY --from=backend /out/onenav /app/onenav
COPY --from=frontend /app/frontend/dist /app/static
ENV ONENAV_PORT=8080 \
    ONENAV_DATA=/data \
    ONENAV_STATIC=/app/static \
    TZ=Asia/Shanghai
# 不要在镜像里写死弱 JWT；首次启动会在 /data/.jwt_secret 自动生成
USER onenav
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
LABEL org.opencontainers.image.title="OneNav" \
      org.opencontainers.image.version="${VERSION}"
CMD ["/app/onenav"]
