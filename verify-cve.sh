#!/usr/bin/env bash
set -euo pipefail
IMAGE="innblikk-frontend"
PORT=8080

echo "== pnpm build + test =="
pnpm install --frozen-lockfile
pnpm run build
pnpm test

echo "== docker build =="
docker build --pull --secret id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN -t "$IMAGE" .

echo "== docker run =="
docker run --rm -d -p "$PORT:$PORT" --name "$IMAGE" "$IMAGE"
sleep 3
curl -sI "localhost:$PORT" || true
docker logs "$IMAGE" || true
docker stop "$IMAGE" >/dev/null

echo "== grype scan =="
grype "$IMAGE" -o table
