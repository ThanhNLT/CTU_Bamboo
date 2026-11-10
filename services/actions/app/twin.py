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
