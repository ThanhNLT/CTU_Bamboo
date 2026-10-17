# Yêu cầu đề thi và kiến trúc 3 tầng

## 1. Yêu cầu của đề

### Bắt buộc (mục 3 của đề)

- **Tầng 1: nền tảng lõi headless (PaaS)**, không có UI, chỉ cung cấp API. Tối thiểu 4 dịch vụ:
  - Định danh và bảo mật (Identity/SSO)
  - Cổng API (API Gateway)
  - Quản trị dữ liệu có cấu trúc và phi cấu trúc
  - Động cơ luồng công việc (Workflow)
- **Tầng 2: ít nhất một ứng dụng có giao diện**, nằm trong một trong 4 không gian H, P, D, I, dùng dịch vụ của Tầng 1.

### Ràng buộc kiến trúc (mục 4) – 4 nguyên lý

1. Phân tách theo vòng đời dữ liệu: giao dịch nóng ở OLTP, dữ liệu lịch sử tự động đẩy xuống Lakehouse.
2. Hội tụ IT/OT: dữ liệu nghiệp vụ kết hợp dữ liệu cảm biến để tạo Digital Twin.
3. Quản trị dữ liệu thế hệ mới: phả hệ, nguồn gốc, chất lượng dữ liệu trên báo cáo.
4. Zero-Trust + GitOps: kiểm dịch mã độc tại biên, hạ tầng bằng mã, tự phục hồi.

### Tham khảo, không bắt buộc

Bảng 7 lớp công nghệ trong đề chỉ là ví dụ; đội được toàn quyền chọn công nghệ. Nền tảng headless tham khảo: Supabase, Strapi, Directus.

### Nộp bài và chung kết

- Kho mã nguồn công khai, cam kết tuân thủ giấy phép phần mềm tự do nguồn mở.
- Hệ thống chạy được để demo; khuyến khích đưa lên Internet.
- Trình bày 15 phút: giải pháp và công nghệ, tính năng nền tảng và bài toán ứng dụng, demo, định hướng.
- Hạn nộp ghi trên đề: 17:00 Chủ Nhật 06/12/2025 (06/12/2025 là thứ Bảy, nghi lỗi của 06/12/2026; cần xác nhận với BTC qua nhóm Telegram).

## 2. Ánh xạ 3 tầng

| Cách gọi theo nguyên tắc phân tách | Tầng trong khung DX-OS | Đặc điểm |
|---|---|---|
| Kỹ thuật chạy ngầm | Tầng 1: Nền tảng Dịch vụ Lõi số | Headless, chỉ API |
| Lớp đệm năng lực số hóa quản trị | Tầng 2: Không gian Năng lực số (H-P-D-I) | Giao diện người dùng, cổng dịch vụ dùng chung |
| Ứng dụng nghiệp vụ đa ngành | Tầng 3: Nền tảng Kinh doanh số | Ứng dụng ngành cắm–rút |

Ưu tiên: **Bắt buộc** (đề yêu cầu) · **Demo** (có trong timeline) · **Mở rộng** (định hướng, làm nếu dư thời gian).

## 3. Tầng 1 – Nền tảng Dịch vụ Lõi số

| Cụm | Hệ thống con | Công nghệ | Ưu tiên |
|---|---|---|---|
| Định danh, bảo mật | Quản trị định danh (SSO, MFA) | Keycloak | Bắt buộc |
| | Két sắt mật mã | OpenBao + External Secrets Operator | Demo |
| | Kiểm dịch tệp tin | ClamAV, YARA; Dangerzone (CDR) | Demo |
| | Chữ ký số, PKI, HSM | step-ca/EJBCA CE, pyHanko, xmlsec, SoftHSM2 | Mở rộng |
| Đa thuê ước, biên mạng | API Gateway zero-trust | Apache APISIX + Coraza WAF + OWASP CRS | Bắt buộc |
| | mTLS nội bộ | Linkerd/Istio, cert-manager | Mở rộng |
| | Che PII | Microsoft Presidio (+ recognizer CCCD, SĐT Việt Nam) | Demo |
| | Đa thuê ước | Keycloak Organizations + quyền Hasura + `tenant_id` | Demo |
| | Đa ngôn ngữ | Tolgee/Weblate, react-i18next | Mở rộng |
| Dữ liệu có cấu trúc | OLTP | PostgreSQL + PostGIS | Bắt buộc |
| | Tự sinh API, phân quyền theo dòng | Hasura GraphQL v2 | Bắt buộc |
| | Lịch sử biến động | Trigger, pgaudit, Debezium CDC | Demo |
| | Đóng băng số liệu theo thời gian | pg_partman, materialized view, snapshot Iceberg | Mở rộng |
| | Lớp ngữ nghĩa | Cube (core) | Mở rộng |
| Dữ liệu phi cấu trúc | Lưu trữ đối tượng S3 | SeaweedFS | Bắt buộc |
| | Quản lý hồ sơ nghiệp vụ | Metadata PostgreSQL + Flowable | Bắt buộc |
| | Chỉ mục toàn văn | Apache Tika + Meilisearch | Demo |
| | Trộn mẫu sinh biểu mẫu | docxtemplater, Carbone CE, Gotenberg | Demo |
| Quy trình, tự động hóa | Động cơ BPMN/DMN | Flowable (REST) | Bắt buộc |
| | Kịch bản ngầm | Knative/Node-RED; Kestra | Mở rộng |
| | Nạp dữ liệu theo lô | Kestra, Apache NiFi, dlt | Demo |
| Vận hành, giám sát | Truy vết phân tán | OpenTelemetry + Jaeger/Tempo | Demo |
| | Nhật ký, kiểm toán bất biến | Vector + Loki/Parseable; immudb | Demo |
| | Trục sự kiện | Apache Kafka (KRaft) | Demo |
| | GitOps | k3s, Helm/Kustomize, ArgoCD, Forgejo CI, Kyverno, Trivy | Demo |
| | Giám sát | Prometheus, Alertmanager, Grafana | Demo |
| | Sao lưu, khôi phục | Velero, pgBackRest | Demo |
| Truyền thông | Thông báo đa kênh | Novu (community)/Apprise, SMTP | Demo |
| | Thời gian thực | Centrifugo | Demo |
| | Hàng đợi chống chối bỏ | Kafka/RabbitMQ + chữ ký thông điệp + immudb | Mở rộng |
| IT/OT, Lakehouse | Thu nhận cảm biến | Mosquitto + FIWARE IoT Agent | Demo |
| | Context Broker NGSI-LD | Orion-LD (Orion cổ điển chỉ hỗ trợ NGSI-v2) | Demo |
| | Lakehouse | Apache Iceberg + Nessie/Polaris + Trino | Demo |
| | Chất lượng dữ liệu | Soda Core | Mở rộng |

## 4. Tầng 2 – Không gian Năng lực số

| Không gian | Hệ thống con | Công nghệ | Ưu tiên |
|---|---|---|---|
| [H] Con người số | Cổng giao tiếp tập trung | Refine + Centrifugo | Demo |
| | Kanban và lịch | Component React tự viết, FullCalendar | Demo |
| | Cộng tác, chat | Matrix/Element hoặc Mattermost | Mở rộng |
| | Ổ đĩa đám mây | Giao diện trên SeaweedFS | Mở rộng |
| | Quản trị tri thức | BookStack/Wiki.js | Mở rộng |
| | Ứng dụng di động hiện trường | Flutter | Mở rộng |
| [P] Quy trình số | **Đề nghị mua sắm – thanh toán** (ứng dụng chính) | Refine + Hasura + Flowable + DMN | Bắt buộc |
| | Thiết kế biểu mẫu, quy trình | form-js, bpmn-js, dmn-js | Demo |
| | Giải mã tài liệu trên RAM | OpenBao transit + PDF.js + watermark | Mở rộng |
| | Thanh toán, hóa đơn điện tử | Hyperswitch; module XML + xmlsec | Mở rộng |
| | Nhân sự: tiếp nhận nhân sự (đã có, [ADR #41](#adr-41)); KPI; dự án | Module trên Hasura; OpenProject/Plane | Mở rộng |
| [D] Dữ liệu số (ấm) | Cổng NGSI-LD, Digital Twin | Orion-LD + widget React | Demo |
| | Lakehouse | Iceberg + Trino/DuckDB | Demo |
| | WebGIS | GeoServer + MapLibre | Demo |
| | IOC/BI | Metabase + ECharts | Demo |
| | DaaS | Hasura/PostgREST qua APISIX | Mở rộng |
| | Phả hệ dữ liệu | OpenMetadata | Demo |
| [D] Dữ liệu số (lạnh) | Phòng đọc ảo chống sửa xóa | S3 Object Lock + trình xem chỉ đọc | Mở rộng |
| | Đối soát sổ cái bất biến | immudb + giao diện xác minh | Mở rộng |
| [I] Trí tuệ số | Tìm kiếm toàn văn và ngữ nghĩa | Meilisearch (hybrid) + embedding bge-m3 qua Ollama | Demo |
| | OCR | PaddleOCR, VietOCR | Demo |
| | Trợ lý RAG | Ollama (Qwen3-4B) + Meilisearch, điều phối trong actions (ADR #51) | Demo |
| | Quản trị tác tử AI | Action trong actions + số liệu từ lượt hỏi (ADR #51) | Demo |

## 5. Tầng 3 – Nền tảng Kinh doanh số

Trong bài thi chỉ làm ứng dụng mini cho kịch bản Tập đoàn X (xem [Kịch bản nghiệp vụ](02-kich-ban-nghiep-vu.md)). Các hệ thống tham khảo để nêu trong phần định hướng:

| Nhóm | Hệ thống | Tham khảo nguồn mở |
|---|---|---|
| Dòng chảy hàng hóa | OMS, WMS, POS, TMS | Odoo CE, ERPNext, OpenBoxes, OSRM + VROOM |
| Thời gian và dự án | PSA, Timesheet, CDE/BIM | OpenProject, Kimai, That Open Engine, IfcOpenShell |
| Trải nghiệm và thuê bao | eKYC/AML, LMS, EMR, CRM | PaddleOCR + DeepFace, Moodle, OpenEMR/HAPI FHIR, Twenty |
| Tài sản và không gian | MES/SCADA, BMS, Smart City | FUXA, Rapid SCADA, OpenRemote, ThingsBoard CE |

Ứng dụng Tầng 3 phải đi qua Tầng 1: đăng nhập Keycloak (OIDC), lưu tệp vào S3, gọi API qua APISIX, đẩy sự kiện vào Kafka.

## 6. Cảnh báo giấy phép

| Không dùng | Lý do | Thay thế |
|---|---|---|
| HashiCorp Vault | BSL 1.1 từ 2023 | OpenBao (MPL-2.0) |
| Redpanda | BSL 1.1 | Apache Kafka |
| n8n | Sustainable Use License | Node-RED, Kestra |
| MongoDB | SSPL | JSONB PostgreSQL, FerretDB |
| Directus | BSL 1.1 | Hasura, Supabase, Strapi |
| MinIO | Bản cộng đồng bị cắt tính năng, ngừng bản build sẵn từ 2025 | SeaweedFS, Garage |
| TimescaleDB bản đầy đủ | Timescale License | Phân vùng gốc PostgreSQL + pg_partman |
| MUI X Pro/Premium | Thương mại | Ant Design |
| Refine AI / refine.new | Sản phẩm thương mại | Chỉ dùng Refine Core (MIT) |

Dùng REUSE (FSFE) + SPDX header, file LICENSE và NOTICE; chạy `license-checker` trong CI cho frontend.
