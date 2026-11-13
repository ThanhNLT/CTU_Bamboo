# Bamboo - DX-OS Open-Core
# @version 0.5.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import psycopg

from .common import Context, bind_session, session_identity


def iot_acknowledge(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    row = conn.execute("SELECT tenant_id FROM iot.incident WHERE id = %s", (args["id"],)).fetchone()
    person = session_identity(session, row[0] if row else None)
    bind_session(conn, session)
    conn.execute("SELECT iot.acknowledge(%s, %s, %s)", (args["id"], person, args["note"]))
    at = conn.execute(
        "SELECT to_char(acknowledged_at, 'YYYY-MM-DD\"T\"HH24:MI:SSOF') FROM iot.incident WHERE id = %s",
        (args["id"],),
    ).fetchone()[0]
    return {"id": args["id"], "acknowledged_at": at}


HANDLERS = {"iot_acknowledge": iot_acknowledge}
