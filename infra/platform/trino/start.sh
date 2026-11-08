#!/bin/bash
set -euo pipefail
TRINO_SHARED_SECRET="$(cat /etc/trino/secrets/shared-secret)"
export TRINO_SHARED_SECRET
exec /usr/lib/trino/bin/run-trino "$@"
