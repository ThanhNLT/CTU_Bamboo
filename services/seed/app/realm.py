# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

import argparse
import json
import pathlib

from .demo import DEMO_USERS, HR_DEMO_USERS, TRANSFER_DEMO_USERS

WEB_ORIGIN = "${WEB_ORIGIN:http://localhost:8000}"
DEV_ORIGIN = "http://localhost:5173"


def build() -> dict:
    users = []
    for user in [*DEMO_USERS, *HR_DEMO_USERS, *TRANSFER_DEMO_USERS]:
        last, _, first = user.full_name.rpartition(" ")
        users.append(
            {
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
            }
        )
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
        "roles": {
            "realm": [
                {"name": "platform_admin", "description": "Quản trị kỹ thuật nền tảng (bắt buộc OTP)"},
            ]
        },
        "clients": [
            {
                "clientId": "bms-web",
                "name": "Ứng dụng Refine",
                "publicClient": True,
                "standardFlowEnabled": True,
                "directAccessGrantsEnabled": False,
                "redirectUris": [f"{WEB_ORIGIN}/*", f"{DEV_ORIGIN}/*"],
                "webOrigins": [WEB_ORIGIN, DEV_ORIGIN],
                "attributes": {
                    "pkce.code.challenge.method": "S256",
                    "post.logout.redirect.uris": f"{WEB_ORIGIN}/*##{DEV_ORIGIN}/*",
                },
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
    default = pathlib.Path(__file__).resolve().parents[3] / "infra/platform/keycloak/realm/bms-realm.json"
    parser.add_argument("--out", default=str(default))
    out = pathlib.Path(parser.parse_args().out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"đã ghi {out}: {len(DEMO_USERS) + len(HR_DEMO_USERS) + len(TRANSFER_DEMO_USERS)} tài khoản")


if __name__ == "__main__":
    main()
