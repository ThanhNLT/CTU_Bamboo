#!/bin/bash
# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

set -euo pipefail
TRINO_SHARED_SECRET="$(cat /etc/trino/secrets/shared-secret)"
export TRINO_SHARED_SECRET
exec /usr/lib/trino/bin/run-trino "$@"
