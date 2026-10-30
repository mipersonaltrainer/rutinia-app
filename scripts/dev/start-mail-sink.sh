#!/bin/sh
# LOCAL ONLY. Gives the running local Supabase stack a place to send e-mail when its own Mailpit is not running
# (the stack here is started with `-x mailpit`). It takes the container name and port GoTrue already points at, so no GoTrue
# configuration changes are needed. Reads from http://127.0.0.1:54324/api/v1/messages (Mailpit-compatible subset).
# Uses an image the Supabase stack already pulled (storage-api ships Node); nothing is downloaded.
set -eu
PROJECT=${SUPABASE_PROJECT_ID:-training-os}
NAME="supabase_inbucket_${PROJECT}"
NET="supabase_network_${PROJECT}"
IMAGE=$(docker ps -a --format '{{.Image}}' --filter "name=supabase_storage_${PROJECT}" | head -1)
[ -n "$IMAGE" ] || { echo "no supabase_storage_${PROJECT} container found: start the Supabase stack first" >&2; exit 1; }
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network "$NET" -p 127.0.0.1:54324:8025 \
  -v "$(cd "$(dirname "$0")" && pwd)/mail-sink.mjs:/sink.mjs:ro" --entrypoint node "$IMAGE" /sink.mjs
echo "mail-sink started as $NAME (http://127.0.0.1:54324/api/v1/messages)"
