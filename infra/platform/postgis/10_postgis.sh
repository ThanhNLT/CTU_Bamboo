# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

# Chạy một lần khi volume dữ liệu còn trống (docker-entrypoint-initdb.d): nạp PostGIS vào $POSTGRES_DB và
# template_postgis, giống hành vi của image postgis/postgis trước đây để volume cũ và mới có cùng extension.
# Được entrypoint `source` (không chạy riêng) nên không đặt set -e ở đây.
export PGUSER="$POSTGRES_USER"

"${psql[@]}" <<-'EOSQL'
	CREATE DATABASE template_postgis IS_TEMPLATE true;
EOSQL

for DB in template_postgis "$POSTGRES_DB"; do
	echo "Nạp PostGIS vào $DB"
	"${psql[@]}" --dbname="$DB" <<-'EOSQL'
		CREATE EXTENSION IF NOT EXISTS postgis;
		CREATE EXTENSION IF NOT EXISTS postgis_topology;
	EOSQL
done
