<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.2
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

# Lịch sử pull request

Từ 07/11 đến 26/11/2026 dự án nằm ở kho `CTUBamboo/Bamboo` (trước đó là `ThanhNLT/Bamboo`). Ngày 26/11/2026 GitHub tạm
khóa tài khoản CTUBamboo; mã nguồn cùng toàn bộ lịch sử commit, nhánh, thẻ phiên bản chuyển sang
[ThanhNLT/CTU_Bamboo](https://github.com/ThanhNLT/CTU_Bamboo). Pull request không chuyển được giữa hai kho (GitHub không
cho nhập lại số PR, trạng thái merge, bình luận), nên trang này ghi lại danh sách PR của kho cũ để tra cứu:

- PR đã merge: nội dung đã nằm trong lịch sử; commit merge (nếu có) ghi kèm, `git show <mã>` để xem. Mã commit là mã
  sau khi đặt lại người commit theo phần việc ngày 26/11/2026 (backend: ThanhNLT, giao diện: LeeHuy, AI: nauxi-xl).
- PR còn mở lúc chuyển kho được mở lại ở kho mới với cùng nhánh, cùng tiêu đề; cột Trạng thái ghi số PR mới.
- Số 53–83 không có PR (dùng cho issue ở kho cũ).

Tiêu đề là tiêu đề tiếng Anh đặt lại ngày 24/11/2026. Khi tài khoản CTUBamboo được mở lại, kho cũ sẽ được chuyển quyền sở
hữu sang ThanhNLT để giữ nguyên PR, issue và bình luận gốc.

| # (kho cũ) | Tiêu đề | Nhánh | Trạng thái |
|---|---|---|---|
| 1 | Add organizations, permissions and position-based approval chains | `feat/to-chuc-phan-quyen` | Đã merge |
| 2 | Add Hasura and Flowable layer for purchase request approval | `feat/hasura-flowable` | Đã merge |
| 3 | Add Keycloak, auth webhook and Group X demo data | `feat/keycloak` | Đã merge |
| 4 | Add purchase request line items, audit log, comments and notifications | `feat/mua-sam-kiem-toan-cong-tac` | Đã merge |
| 5 | Add attachments on SeaweedFS with content checks and ClamAV scanning | `feat/tep-dinh-kem` | Đã merge |
| 6 | Add persistent OpenBao with least-privilege AppRole | `feat/openbao` | Đã merge |
| 7 | Add one-command Docker build, healthchecks and CI pipeline | `feat/phat-hanh-docker` | Đã merge |
| 8 | Document all demo and admin accounts in README | `docs/readme-tai-khoan` | Đã merge |
| 9 | Add APISIX API gateway with Coraza WAF | `feat/cong-api` | Đã merge |
| 10 | Fix Keycloak redirect by adding WEB_ORIGIN to the web client | `fix/keycloak-redirect` | Đã merge |
| 11 | Add a least-privilege database role per service | `feat/db-roles` | Đã merge |
| 12 | Add a least-privilege database role per service (follow-up) | `feat/db-roles` | Đã merge |
| 13 | Add full-text search with Meilisearch and Tika | `feat/tim-kiem` | Đã merge |
| 14 | Release 0.3.0 | `release/v0.3.0` | Đã merge |
| 15 | Generate purchase request forms as PDF with Gotenberg | `feat/phieu-pdf` | Đã merge |
| 16 | Add Debezium CDC from the bms database to Kafka | `feat/cdc` | Đã merge |
| 17 | Add Kafka to Iceberg bronze lakehouse layer | `feat/lakehouse` | Đã merge |
| 18 | Add Trino silver layer views | `feat/silver-trino` | Đã merge |
| 19 | Connect UI to search, form printing and process diagram actions | `feat/giao-dien-api` | Đã merge |
| 20 | Add personnel onboarding requests with encrypted sensitive data | `feat/nhan-su` | Đã merge |
| 21 | Reduce resource usage of actions, JVM services, Postgres and web UI | `perf/toi-uu-tai-nguyen` | Đã merge |
| 22 | Add intercompany orders between group companies | `feat/don-hang-noi-bo` | Đã merge |
| 23 | Mask personal data with Presidio | `feat/che-pii` | Đã merge |
| 24 | Use real data on Inbox, Home, Records, Drive and Operations Center | `feat/gan-api-giao-dien` | Đã merge |
| 25 | Fix SeaweedFS running out of volumes for buckets | `fix/seaweedfs-volume` | Đã merge |
| 26 | Add tenant data administration pages and Excel import | `feat/quan-tri-du-lieu` | Đã merge |
| 27 | Fix WAF blocking Keycloak session cookies | `fix/waf-cookie-keycloak` | Đã merge |
| 28 | Secure Kafka with SCRAM/ACL and Trino with HTTPS and tenant row filters | `feat/bao-mat-nen-tang` | Đã merge |
| 29 | Bind long-running services to 127.0.0.1 | `fix/cong-dich-vu` | Đã merge |
| 30 | Format all code with ruff, Prettier and shfmt | `chore/sua-loi-chu-thich-format` | Đã merge |
| 31 | Use real data in Ledger with audit hash chain verification | `feat/so-cai` | Đã merge |
| 32 | Add off-catalog supplier suggestions and drive quotas | `feat/sua-loi-bao-cao` | Đã merge |
| 33 | Add BPMN process designer with server validation and sandbox runs | `feat/thiet-ke-quy-trinh` | Đã merge |
| 34 | Add knowledge library with approval, publishing and read scopes | `feat/thu-vien-tri-thuc` | Đã merge |
| 35 | Complete Operations Center with real data and merged site map | `feat/dieu-hanh-ban-do` | Đã merge |
| 36 | Add demo data for digital twin, data lineage and pinned KPIs | `feat/du-lieu-demo-nhom5` | Đã merge |
| 37 | Load digital twin, data lineage and pinned KPIs from the database | `feat/noi-du-lieu-nhom5` | Đã merge |
| 38 | Remove unused refine.svg starter image | `chore/don-anh-thua` | Đã merge |
| 39 | Fix Keycloak redirect (not merged) | `fix/keycloak-redirect` | Đóng, không merge |
| 40 | Pin reuse 5.1.1 to fix license lint on Vietnamese text | `fix/reuse-lint` | Đã merge |
| 41 | Clean up and simplify frontend code | `chore/lam-gon-ma` | Đã merge 14/10/2026, `91726c5` |
| 42 | Fix Keycloak redirect (no changes) | `fix/keycloak-redirect` | Đã merge 14/10/2026, `6b9b484` |
| 43 | Allow adding item groups from the purchase request form | `chore/form-de-nghi` | Đã merge 14/10/2026, `6237fef` |
| 44 | Fix position assignment in admin Excel import | `chore/nhap-excel` | Đã merge 14/10/2026, `fd2683f` |
| 45 | Add file deletion in Drive and remove OpenMetadata leftovers | `chore/xoa-tep-openmetadata` | Đã merge 14/10/2026, `f328df0` |
| 46 | Compute KPIs from real data | `chore/kpi-dong-nhat` | Đã merge 14/10/2026, `622a3a4` |
| 47 | Redirect 127.0.0.1 to localhost at the gateway | `fix/chuyen-huong-127` | Đã merge 14/10/2026, `8f59321` |
| 48 | Make demo seed data idempotent | `fix/seed-du-lieu-chu` | Đã merge 14/10/2026, `89f1477` |
| 49 | Allow deleting people added by mistake | `feat/xoa-nguoi` | Đã merge 14/10/2026, `b1467ed` |
| 50 | Add script to create a new company tenant | `feat/keycloak` | Đã merge 14/10/2026, `f3a014a` |
| 51 | Add Vietnamese OCR, local RAG assistant and on-demand AI models | `feat/ocr-gpu` | Đã merge 21/10/2026, `9091599` |
| 52 | Reduce RAM usage of JVM services, lakehouse sink and AI worker | `perf/giam-ram` | Đã merge 21/10/2026, `263104b` |
| 84 | Remove unused settings and comments | `chore/don-chu-thich` | Đã merge 21/10/2026, `d87646a` |
| 85 | Add sleeper service that idles Tier 1 services | `feat/dich-vu-tu-ngu` | Đã merge 23/10/2026, `db6bac0` |
| 86 | Add 8 GB and 16 GB RAM profiles to make up | `feat/dich-vu-tu-ngu` | Đã merge 23/10/2026, `c8ed017` |
| 87 | Add personnel transfers backend | `feat/ai-tu-ngu` | Đã merge 24/10/2026, `5093468` |
| 88 | Complete Tier 1: notifications, logs, backups, automation, templates and OCR input | `chore/cap-nhat-tai-lieu` | Đã merge 25/10/2026, `7ef7b8d` |
| 89 | Add sample BPMN processes and personnel demo data | `feat/chuyen-nhan-su-demo` | Đã merge 26/10/2026, `b2a1b34` |
| 90 | Fix demo account assignment in seed | `fix/gan-tai-khoan-demo` | Đã merge 26/10/2026, `77a005d` |
| 91 | Release 0.4.0 | `chore/phat-hanh-0.4.0` | Đã merge 29/10/2026, `56340f8` |
| 92 | Add functional module framework | `feat/khung-mo-dun` | Đã merge 30/10/2026, `04d6268` |
| 93 | Add company setup wizard and owner account | `feat/khoi-tao-cong-ty` | Đã merge 30/10/2026, `f64ad80` |
| 94 | Protect owner accounts with login device tracking | `feat/chu-so-huu` | Đã merge 30/10/2026, `02043c8` |
| 95 | Remove national header from document templates | `fix/bo-quoc-hieu` | Đã merge |
| 96 | Index long files in full-text chunks | `feat/chi-muc-toan-van` | Đã merge 30/10/2026, `75c7c97` |
| 97 | Link processes to regulation documents | `feat/quy-trinh-van-ban` | Đã merge 30/10/2026, `52ad5b0` |
| 98 | Scope automated processes and decisions by owning unit | `feat/mo-dun-ngoai` | Đã merge 02/11/2026, `b3ab043` |
| 99 | Restructure repository into a monorepo | `refactor/monorepo` | Đã merge 03/11/2026, `bf9dbce` |
| 100 | Add missing external module UI, docs and examples | `update/missing-libraries` | Đã merge 03/11/2026, `97cf561` |
| 101 | Add Bamboo Glass UI and simplified sign-up | `feat/bamboo-glass` | Đã merge 03/11/2026, `d13adb4` |
| 102 | Add Space I: AI assistant and BI analytics | `feat/khong-gian-i` | Đã merge 04/11/2026, `afe3470` |
| 103 | Add Space D: real-time data, automatic lineage and API portal | `feat/khong-gian-d` | Đã merge 04/11/2026, `8f6b9af` |
| 104 | Add Space H: messaging, work calendar and mobile app | `feat/khong-gian-h` | Đã merge 05/11/2026, `3eeb418` |
| 105 | Add Space P: project management and planning | `feat/khong-gian-p` | Đã merge 05/11/2026, `5e28393` |
| 106 | Optimize Spaces H, P and D | `feat/toi-uu-hpd` | Đã merge 05/11/2026, `be22d52` |
| 107 | Add demo data for Spaces H, P and D | `feat/du-lieu-demo-hpd` | Đã merge 05/11/2026, `14390c5` |
| 108 | Fix demo login failing with "account not in any tenant" | `fix/dang-nhap-demo` | Đã merge 05/11/2026, `55e3494` |
| 109 | Clean up E2E test accounts on the demo database | `fix/don-tai-khoan-e2e` | Đã merge 05/11/2026, `d5d5188` |
| 110 | Add Vietnamese/English switch on login and sign-up pages | `feat/chuyen-ngon-ngu-dang-nhap` | Đã merge 05/11/2026, `ced471a` |
| 111 | Build Bamboo images from source on docker compose up | `fix/compose-build` | Đã merge 05/11/2026, `b13971d` |
| 112 | Make gateway wait for backend services at startup | `fix/cong-khoi-dong` | Đã merge 05/11/2026, `4f6c879` |
| 113 | Fix OpenBao unseal after restart and run AI at every RAM profile | `fix/openbao-unseal` | Đã merge 05/11/2026, `7e21894` |
| 114 | Complete Tier 1: CDR, P.A.R.A drive, AI agents, MQTT, observability and mTLS | `feat/hoan-thien-tang-1` | Đã merge 07/11/2026, `8992147` |
| 115 | Auto-detect NVIDIA GPU, lighter healthchecks and AI admin permission | `feat/hoan-thien-tang-1` | Đã merge 07/11/2026, `0072b10` |
| 116 | Move repository to CTUBamboo and publish images on GHCR | `chore/doi-tai-khoan` | Đã merge 07/11/2026, `fbfbd8a` |
| 117 | Remove code comments and fix UI errors | `chore/xoa-comment` | Đã merge 08/11/2026, `db87db8` |
| 118 | Fix CRLF line endings breaking scripts on Windows | `fix/crlf-windows` | Đã merge 10/11/2026, `b4a5454` |
| 119 | Replace components without OSI-approved licenses | `fix/giay-phep` | Đã merge 10/11/2026, `6fe1412` |
| 120 | Set Bamboo as copyright holder | `chore/ban-quyen-bamboo` | Đã merge 10/11/2026, `b4ef66c` |
| 121 | Add license headers to all source files | `chore/header` | Đã merge 10/11/2026, `16cdd80` |
| 122 | Use full Apache-2.0 headers and add per-user language setting | `chore/xoa-comment-dinh-dang` | Đã merge 13/11/2026, `fa24ffc` |
| 123 | Add make build/install from source and contributor docs | `feat/dich-tu-ma-nguon` | Đã merge 13/11/2026, `fc23821` |
| 124 | Disable Tier 1 web consoles and schedule GitOps runs | `fix/headless-gitops` | Đã merge |
| 125 | Fix API gateway 404 and services stopping at startup | `fix/cong-api-404` | Đã merge |
| 126 | Fix work calendar column alignment and OCR input spacing | `fix/cong-api-404` | Đã merge |
| 127 | Fix company setup server error and log warnings to stderr | `fix/cong-api-404` | Đã merge |
| 128 | Limit CPU for heavy services and pause polling in hidden tabs | `perf/toi-uu-he-thong` | Đã merge 16/11/2026, `e8d75d5` |
| 129 | Make AI assistant answer in the question's language (not merged) | `fix/tro-ly-ai-tra-loi` | Đóng, không merge |
| 130 | Make AI assistant answer in the question's language | `fix/loi-ton-dong-ai` | Đã merge 18/11/2026, `3bf13f6` |
| 131 | Reject embedding-only models for AI chat | `fix/mo-hinh-embedding` | Đã merge 18/11/2026, `c82cee3` |
| 132 | Run AI on Metal GPU on Apple Silicon | `feat/apple-silicon` | Đã merge 18/11/2026, `f80255f` |
| 133 | Add library and license inventory and handover notes | `docs/thu-vien-ban-giao` | Đã merge 24/11/2026, `1647771` |
| 134 | Add 5 GB storage quota per account | `feat/han-muc-tai-khoan` | Đã merge 24/11/2026, `6e8834c` |
| 135 | Add test scenario document and adjust compose files | `chore/compose-kich-ban-kiem-thu` | Đã merge 24/11/2026, `221ad82` |
| 136 | Add semantic search to the Search page | `update/semantic-search` | Đang mở lúc chuyển kho → #3 ở kho mới |
| 137 | Use Qwen3 4B Instruct as default chat model and f16 KV cache on Mac | `update/instruct-chat-model` | Đang mở lúc chuyển kho → #4 ở kho mới |
| 138 | Try to fix the e2e/playwright bug | `claude/e2e-dependencies-install-add490` | Đang mở lúc chuyển kho → #1 (đã merge) ở kho mới |
| 139 | Rebuild prebuilt GHCR images and speed up image builds | `update/ghcr-images` | Đã merge 26/11/2026, `132f21b` → #5 ở kho mới |
| 140 | Fix stale Playwright tests and raise the e2e job time limit | `update/e2e-fixes` | Đã merge 26/11/2026, `2894111` |
| 141 | Trace requests from the API gateway through Hasura to actions | `update/gateway-tracing` | Đang mở lúc chuyển kho → #6 ở kho mới |
| 142 | Add mTLS on internal HTTP hops with an opt-in compose overlay | `update/internal-mtls` | Đang mở lúc chuyển kho → #7 ở kho mới |
| 143 | Sign issued PDFs with the organisation certificate via PKCS#11 or CSC | `update/org-signing` | Đang mở lúc chuyển kho → #8 ở kho mới |
| 144 | Generate Kubernetes manifests from compose and add Argo CD sync | `update/k8s-argocd` | Đang mở lúc chuyển kho → #9 ở kho mới |
| 145 | Keep CPU AI off in CI e2e and only offer positions valid from today | `update/ci-stability` | Đang mở lúc chuyển kho → #10 ở kho mới |
