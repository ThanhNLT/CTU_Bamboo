"""Sinh realm Keycloak `bms` từ danh sách tài khoản demo (ADR #23, #32).

    python -m app.realm [--out platform/keycloak/realm/bms-realm.json]

Mật khẩu không nằm trong file: Keycloak thay `${DEMO_PASSWORD}` bằng biến môi trường
lúc import. Tài khoản mang realm role platform_admin bắt buộc cài OTP ở lần đăng nhập đầu.
"""

import argparse
import json
import pathlib

from .demo import DEMO_USERS

WEB_ORIGIN = "http://localhost:5173"


def build() -> dict:
    users = []
    for user in DEMO_USERS:
        last, _, first = user.full_name.rpartition(" ")
        users.append({
            "id": str(user.id),
            "username": user.username,
            "enabled": True,
            "emailVerified": True,
            "firstName": first,
            "lastName": last,
            "email": f"{user.username}@demo.bamboo.local",
            "credentials": [{"type": "password", "value": "${DEMO_PASSWORD}", "temporary": False}],
            "realmRoles": ["default-roles-bms", *user.realm_roles],
            "requiredActions": ["CONFIGURE_TOTP"] if "platform_admin" in user.realm_roles else [],
        })
    return {
        "realm": "bms",
        "enabled": True,
        "displayName": "Bamboo DX-OS",
        "sslRequired": "external",
        "registrationAllowed": False,
        "resetPasswordAllowed": False,
        "loginWithEmailAllowed": True,
        "duplicateEmailsAllowed": False,
        "bruteForceProtected": True,
        "internationalizationEnabled": True,
        "supportedLocales": ["vi", "en"],
        "defaultLocale": "vi",
        "accessTokenLifespan": 300,
        "ssoSessionIdleTimeout": 1800,
        "otpPolicyType": "totp",
        "otpPolicyAlgorithm": "HmacSHA1",
        "otpPolicyDigits": 6,
        "otpPolicyPeriod": 30,
        "roles": {"realm": [
            {"name": "platform_admin", "description": "Quản trị kỹ thuật nền tảng (bắt buộc OTP)"},
        ]},
        "clients": [
            {
                "clientId": "bms-web",
                "name": "Ứng dụng Refine",
                "publicClient": True,
                "standardFlowEnabled": True,
                "directAccessGrantsEnabled": False,
                "redirectUris": [f"{WEB_ORIGIN}/*"],
                "webOrigins": [WEB_ORIGIN],
                "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": f"{WEB_ORIGIN}/*"},
            },
            {
                "clientId": "bms-e2e",
                "name": "Kiểm thử tự động (chỉ dev)",
                "publicClient": True,
                "standardFlowEnabled": False,
                "directAccessGrantsEnabled": True,
            },
        ],
        "users": users,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    default = pathlib.Path(__file__).resolve().parents[3] / "platform/keycloak/realm/bms-realm.json"
    parser.add_argument("--out", default=str(default))
    out = pathlib.Path(parser.parse_args().out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"đã ghi {out}: {len(DEMO_USERS)} tài khoản")


if __name__ == "__main__":
    main()
