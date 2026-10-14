# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

import time

import jwt
import psycopg


class AuthError(Exception):
    pass


class KeycloakVerifier:
    def __init__(self, jwks_url: str, issuer: str, clients: set[str], jwks_client=None):
        self.jwks = jwks_client or jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=300)
        self.issuer = issuer
        self.clients = clients

    def verify(self, token: str) -> dict:
        try:
            key = self.jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256"],
                issuer=self.issuer,
                options={"verify_aud": False, "require": ["exp", "sub", "iss"]},
            )
        except jwt.PyJWTError as exc:
            raise AuthError(f"Token không hợp lệ: {exc}") from exc
        if claims.get("typ") != "Bearer":
            raise AuthError("Không phải access token")
        if claims.get("azp") not in self.clients:
            raise AuthError(f"Client {claims.get('azp')} không được phép")
        return claims


class MembershipCache:
    def __init__(self, ttl: float = 60.0, max_size: int = 10_000):
        self.ttl = ttl
        self.max_size = max_size
        self.items: dict[tuple[str, str], tuple[float, str | None]] = {}

    def get(self, conn: psycopg.Connection, sub: str, tenant: str) -> str | None:
        now = time.monotonic()
        hit = self.items.get((sub, tenant))
        if hit and hit[0] > now:
            return hit[1]
        row = conn.execute(
            "SELECT person_id FROM core.account_tenants(%s) WHERE tenant_id::text = %s", (sub, tenant)
        ).fetchone()
        if len(self.items) >= self.max_size:
            self.items.clear()
        person = str(row[0]) if row else None
        self.items[(sub, tenant)] = (now + self.ttl, person)
        return person


def session_for(
    conn: psycopg.Connection,
    claims: dict,
    tenant: str | None,
    requested_role: str | None,
    cache: MembershipCache | None = None,
) -> dict:
    sub = claims["sub"]
    ttl = max(0, int(claims["exp"] - time.time()))
    base = {"X-Hasura-Account-Id": sub, "Cache-Control": f"max-age={ttl}"}
    if not tenant:
        return {**base, "X-Hasura-Role": "account"}

    person = (cache or MembershipCache(ttl=0)).get(conn, sub, tenant)
    if person is None:
        raise AuthError("Tài khoản không thuộc tenant này")
    role = "user"
    if requested_role == "platform_admin":
        if "platform_admin" not in claims.get("realm_access", {}).get("roles", []):
            raise AuthError("Tài khoản không có quyền platform_admin")
        role = "platform_admin"
    return {**base, "X-Hasura-Role": role, "X-Hasura-User-Id": person, "X-Hasura-Tenant-Id": tenant}


def my_tenants(conn: psycopg.Connection, session: dict) -> list[dict]:
    sub = session.get("x-hasura-account-id")
    if not sub:
        return []
    rows = conn.execute(
        """SELECT a.tenant_id, a.tenant_code, t.name, a.person_id, p.full_name
           FROM core.account_tenants(%s) a
           JOIN core.tenant t ON t.id = a.tenant_id JOIN core.person p ON p.id = a.person_id
           ORDER BY a.tenant_code""",
        (sub,),
    ).fetchall()
    return [
        {"tenant_id": str(r[0]), "tenant_code": r[1], "tenant_name": r[2], "person_id": str(r[3]), "full_name": r[4]}
        for r in rows
    ]
