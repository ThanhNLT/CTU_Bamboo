# Timeline 01–31/10/2026 (bản 3: Refine + kịch bản Tập đoàn X)

Giả định: 3 thành viên, 3–4 giờ/ngày. Phạm vi: Vòng 1 + Vòng 2 rút gọn + một phần Vòng 3.

- **A (Platform/DevOps & Security)**: hạ tầng, Keycloak, APISIX, OpenBao, GitOps.
- **B (Backend & Data)**: PostgreSQL, Hasura (Actions bọc Flowable), Flowable, luồng dữ liệu, AI.
- **C (Frontend Refine)**: ứng dụng Refine, các provider, giao diện, demo.

## Tổng quan

| Giai đoạn | Thời gian | Mục tiêu | Mốc |
|---|---|---|---|
| Tuần 0 | 01–04/10 | Chốt kiến trúc, kịch bản, môi trường | Repo, sơ đồ C4, app Refine chạy dữ liệu giả |
| Tuần 1 | 05–11/10 | 4 dịch vụ lõi + khung Refine | M1: đăng nhập Keycloak trên Refine, đọc Hasura qua APISIX |
| Tuần 2 | 12–18/10 | Ứng dụng mua sắm end-to-end | M2: đề nghị → duyệt theo hạn mức (DMN) → phiếu PDF, realtime |
| Tuần 3 | 19–25/10 | 4 nguyên lý + IOC | M3: CDC → Lakehouse, phòng sạch → Orion-LD, ArgoCD tự phục hồi |
| Tuần 4 | 26–31/10 | AI, kiểm thử, tài liệu, demo | M4: code freeze 30/10, tổng duyệt 31/10 |

## Tuần 0 (01–04/10)

| Ai | Việc |
|---|---|
| Cả đội | Chốt tên tập đoàn hư cấu, cây tổ chức 5 đơn vị, kịch bản demo 5 bước. Giấy phép dự án Apache-2.0 |
| A | Monorepo, `docker-compose` khung, CI (lint, Trivy, license-checker) |
| B | Chạy thử migration 001; ERD đề nghị mua sắm; BPMN nháp; danh sách Hasura Action (`start_process`, `complete_task`, `get_upload_url`); script dữ liệu mẫu (Faker, Synthea) |
| C | Tutorial Refine v5 (nếu cần); `create refine-app` (Vite + React Router + Ant Design); wireframe |

## Tuần 1 (05–11/10)

| Ngày | A | B | C |
|---|---|---|---|
| 05–06 | Keycloak: realm, client PKCE, MFA | PostgreSQL + PostGIS, migration; `tenant_relation`, tenant bệnh viện | `authProvider` Keycloak |
| 07–08 | APISIX: route GraphQL, openid-connect, CORS, rate-limit | Hasura: tracking, phân quyền theo dòng/tenant, JWT claims | `dataProvider` @refinedev/hasura qua APISIX |
| 09 | OpenBao: secret DB, API key | SeaweedFS + bucket; Action `get_upload_url` | `accessControlProvider` (CASL), menu theo quyền |
| 10 | Coraza WAF + ClamAV tại gateway | Flowable + BPMN nháp; Action `start_process` | Danh sách đề nghị mua sắm (useTable) |
| 11 | Review + demo M1 | | |

## Tuần 2 (12–18/10)

| Ngày | A | B | C |
|---|---|---|---|
| 12–13 | Multi-tenancy: claim tenant → quyền Hasura | Action `complete_task`; đồng bộ task Flowable; **bảng DMN hạn mức** | Form đề nghị (useForm) + upload presigned + `start_process` |
| 14–15 | Centrifugo qua gateway | Lịch sử phê duyệt; bảng audit | Hộp việc cần duyệt, chi tiết (useShow), react-pdf, duyệt/trả về |
| 16 | Presidio che PII | Meilisearch + Action `search_documents`; **đơn hàng nội bộ chip → điện thoại (đơn giản)** | `liveProvider` + thông báo; tìm kiếm |
| 17 | Hỗ trợ tích hợp | Gotenberg + docxtemplater sinh phiếu PDF | bpmn-js viewer tô bước hiện tại; `i18nProvider` |
| 18 | Review + demo M2 | | |

## Tuần 3 (19–25/10)

| Ngày | A | B | C |
|---|---|---|---|
| 19–20 | k3s, Helm/Kustomize | Kafka + Debezium | Dashboard IOC theo từng công ty (ECharts, Metabase embed) |
| 21–22 | ArgoCD, demo tự phục hồi | Iceberg + Nessie/Polaris + Trino; Kestra đẩy dữ liệu cũ | Bản đồ MapLibre (nhà máy, chi nhánh, bệnh viện) |
| 23 | Velero; Prometheus/Grafana | **Cảm biến phòng sạch giả lập** → Mosquitto → IoT Agent → Orion-LD; gắn cờ lô wafer | Widget Digital Twin phòng sạch |
| 24 | Vector + Loki/Parseable; OpenTelemetry | OpenMetadata lineage; Soda Core | Hoàn thiện IOC; build tĩnh + Helm chart app |
| 25 | Review + demo M3 | | |

Nếu chậm, cắt theo thứ tự ưu tiên giữ lại: GitOps tự phục hồi > CDC → Lakehouse > Lineage > IoT.

## Tuần 4 (26–31/10)

| Ngày | A | B | C |
|---|---|---|---|
| 26–27 | TLS (cert-manager), Kyverno | RAG quy chế mua sắm (LlamaIndex + Ollama + Qdrant) | Chatbot [I] có trích dẫn |
| 28 | Triển khai VPS/Internet | PaddleOCR đọc báo giá, hóa đơn | OCR tự điền form đề nghị |
| 29 | k6, Trivy, sửa lỗi | Test API, luồng Flowable | Playwright E2E; video demo dự phòng |
| 30 | Code freeze; SPDX/REUSE, LICENSE, NOTICE | Tài liệu API, hướng dẫn cài đặt | Báo cáo license-checker; slide |
| 31 | Tổng duyệt theo kịch bản 5 bước, bấm giờ, câu hỏi phản biện | | |

## Nguyên tắc vận hành

- Họp 15 phút mỗi tối; review và demo mỗi Chủ Nhật; không mang nợ quá 1 tuần.
- Issue board gắn nhãn theo tuần và theo tầng.
- Mọi thay đổi hạ tầng qua Git.
- B công bố schema GraphQL và danh sách Action trước thứ Hai mỗi tuần; C sinh type bằng graphql-codegen.
- UI không bao giờ gọi thẳng dịch vụ lõi.

## Rủi ro

| Rủi ro | Dấu hiệu | Xử lý |
|---|---|---|
| C chưa quen React/Refine | Sau 04/10 chưa có trang list/show | `@refinedev/inferencer` sinh khung; A hỗ trợ authProvider |
| Tài liệu Refine v4/v5 lẫn lộn | Ví dụ không chạy | Bám tài liệu v5; ghim phiên bản `@refinedev/*` |
| Keycloak–APISIX–Hasura mất thời gian | Lỗi JWT/CORS quá 2 ngày | Mapper claim Hasura từ đầu; CORS tại APISIX |
| Đồng bộ task Flowable phức tạp | Hộp việc sai trạng thái | Action gọi Flowable trực tiếp, bỏ đồng bộ |
| Phạm vi 5 đơn vị quá rộng | Tuần 2 chưa xong M2 | Chỉ giữ 2 công ty (chip, điện thoại) + bệnh viện cho demo cách ly |
| Thiếu RAM | Container bị kill | Profile compose (core, data, ai); VPS 32 GB tuần 3–4 |
| Iceberg/Trino chưa chạy sau 21/10 | | DuckDB đọc Parquet trên S3 |
| LLM chậm trên CPU | Trên 30 giây | Mô hình 3B–7B lượng tử hóa; video dự phòng |
