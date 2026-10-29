# Yêu cầu đề thi và kiến trúc 3 tầng

Trang này tóm tắt yêu cầu của đề thi và thể lệ OLP Phần mềm nguồn mở 2026, rồi đối chiếu từng yêu cầu với hiện trạng của
Bamboo. Nguồn gốc (VFOSSA):

- Đề thi *Xây dựng Hệ điều hành Chuyển đổi số bằng Công nghệ Lõi nguồn mở (DX-OS Open-Core)*, đăng 30/09/2026:
  <https://vfossa.vn/tin-tuc/de-thi-phan-mem-nguon-mo-olp-2026-798.html>
- Thể lệ và tiêu chí chấm điểm: <https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html>
- Giới thiệu mô hình DX-OS và chủ đề: <https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html>

Đối chiếu dưới đây cập nhật ngày 29/10/2026. Giới hạn chi tiết và hướng phát triển ghi ở README, mục *Kiến trúc hệ thống → Đang làm và dự kiến*.

## 1. Yêu cầu của đề

### Bắt buộc (mục 3 của đề)

- **Tầng 1: nền tảng lõi headless (PaaS)**, không cung cấp giao diện người dùng, có tối thiểu: Định danh bảo mật
  (Identity/SSO), Cổng API (API Gateway), Quản trị dữ liệu có cấu trúc và phi cấu trúc, Động cơ luồng công việc (Workflow).
- **Tầng 2: ít nhất một ứng dụng có giao diện** thuộc một trong bốn không gian H, P, D, I, dùng dịch vụ của Tầng 1.

### Bốn nguyên lý thiết kế (mục 4)

1. Phân tách chức năng theo vòng đời và tốc độ dữ liệu: giao dịch ở OLTP, dữ liệu lịch sử tự đẩy xuống hồ dữ liệu.
2. Hội tụ dữ liệu hành chính (IT) và vận hành (OT): bản sao số theo thời gian thực.
3. Quản trị dữ liệu thế hệ mới: phả hệ, nguồn gốc, chất lượng dữ liệu trên báo cáo.
4. Zero-Trust gắn với GitOps: kiểm dịch mã độc tại biên, hạ tầng bằng mã, tự phục hồi.

Bảng 7 lớp công nghệ trong đề chỉ là ví dụ; đội được toàn quyền chọn công nghệ.

### Thể lệ

- **Điều kiện để được chấm:** phần mềm nguồn mở theo giấy phép OSI-approved, mã nguồn truy cập tự do trên Internet.
- **Tiêu chí PoF (50 điểm, chấm kho mã 7–9/12/2026):** kho mã trên Internet (5), giấy phép OSI (10), có bản phát hành (5),
  dịch từ mã nguồn (10), thư viện và gói đính kèm (10), tài liệu và giao tiếp (10).
- **Tiêu chí sản phẩm (50 điểm, chung kết 10/12/2026):** tính nguyên gốc, mức độ hoàn thiện, thân thiện, phát triển bền vững,
  trình diễn và thu hút cộng đồng (mỗi tiêu chí 10).
- **Nộp bài:** thư gửi `olpvietnam@vaip.vn` và `thuky@vfossa.vn`, tiêu đề `BÀI THI PMNM 2026 - [Tên Đội] - [Tên Trường]`, kèm
  thành viên, người hướng dẫn, đường dẫn kho mã và cam kết bản quyền; hạn **17:00 Chủ nhật 06/12/2026**.
- **Chung kết:** hệ thống chạy được để demo (khuyến khích đưa lên Internet); trình bày 15 phút: giải pháp và công nghệ, tính năng
  và bài toán ứng dụng, demo, định hướng.

## 2. Đối chiếu tiêu chí PoF

| Tiêu chí | Đáp ứng trong kho mã |
|---|---|
| Kho mã trên Internet, có web viewer, thực sự được dùng | GitHub `ThanhNLT/Bamboo`: lịch sử commit, pull request, nhánh tính năng. Kho phải ở chế độ công khai trước khi BTC chấm |
| Giấy phép OSI ghi trong từng tệp mã | Header SPDX theo chuẩn REUSE 3.3; ngoại lệ (tệp không ghi được header) khai báo trong `REUSE.toml`; kiểm bằng `reuse lint` |
| Không có giấy phép không tương thích | Mã của dự án Apache-2.0; thành phần bên thứ ba và giấy phép liệt kê trong `NOTICE` |
| Thông báo mục đích giấy phép | `NOTICE` (đoạn mục đích giấy phép), README mục Giấy phép |
| Bản sao toàn văn giấy phép | `LICENSE`, `LICENSES/` |
| Có bản phát hành theo phiên bản, định dạng mở | GitHub Releases theo SemVer, asset `.tar.gz` kèm `SHA256SUMS` và `compose.release.yml`; [CHANGELOG](https://github.com/ThanhNLT/Bamboo/blob/main/CHANGELOG.md) theo Keep a Changelog |
| Hướng dẫn dịch từ mã nguồn, cấu hình được trước khi dịch, công cụ nguồn mở | README: chạy bằng một lệnh (`make up`) và build từng thành phần không dùng Docker; cấu hình bằng biến môi trường (`.env.example`); Docker Engine, Compose, make, npm, pip |
| Chạy được ngoài thư mục mã nguồn | `compose.release.yml` chạy bằng image phát hành, không cần thư mục mã |
| Dùng thư viện có sẵn, không đóng gói kèm, không sửa mã gói phụ thuộc | Phụ thuộc cài từ PyPI và npm, ghim phiên bản (`constraints.txt`, `package-lock.json`); dịch vụ dùng image chính thức của upstream, không vá mã |
| Bug tracker, changelog, readme | GitHub Issues (có mẫu báo lỗi, đề xuất), `CHANGELOG.md`, `README.md`, tài liệu Sphinx (`make -C docs html`), `SECURITY.md` |

## 3. Kiến trúc 3 tầng

| Tầng trong khung DX-OS | Trong Bamboo |
|---|---|
| Tầng 1: Nền tảng Dịch vụ Lõi số (headless) | Các dịch vụ trong `docker-compose.yml`, chỉ phục vụ qua cổng API APISIX `:8000`; không có giao diện người dùng cuối. Giao diện quản trị đi kèm một số dịch vụ chỉ nghe `127.0.0.1` |
| Tầng 2: Không gian Năng lực số (H-P-D-I) | Ứng dụng Refine `apps/web/web`, gọi Tầng 1 qua `/graphql` ([API của nền tảng](../thiet-ke/08-api-giao-dien.md)) |
| Tầng 3: Nền tảng Kinh doanh số | Chưa làm; kịch bản Tập đoàn X dùng để nêu định hướng ([Kịch bản nghiệp vụ](02-kich-ban-nghiep-vu.md)) |

```text
Trình duyệt / ứng dụng ──► APISIX (WAF Coraza + OWASP CRS, kiểm token tại biên, giới hạn tần suất, X-Request-Id)
                             ├── /realms     → Keycloak (OIDC + PKCE, MFA)
                             ├── /graphql    → Hasura ──► PostgreSQL + PostGIS (nguồn sự thật, phân quyền theo dòng)
                             │                  └── Actions (FastAPI) ──► Flowable, OpenBao, SeaweedFS, Meilisearch, Gotenberg, Ollama...
                             ├── /bms-*      → SeaweedFS S3 (link có chữ ký, bucket kiểm dịch)
                             ├── /ingest/*   → nạp dữ liệu theo lô
                             └── /hooks/*    → webhook khởi chạy quy trình tự động
PostgreSQL ── Debezium ──► Kafka ──► Iceberg (bronze) ──► Trino (silver, lớp ngữ nghĩa)
```

## 4. Tầng 1: đối chiếu theo cụm dịch vụ của đề

Mức: **Có** = đã hiện thực và kiểm thử; **Một phần** = có nhưng đơn giản hơn yêu cầu của đề; **Chưa** = chưa có.

| Cụm | Hệ thống con | Hiện thực | Mức |
|---|---|---|---|
| Định danh, bảo mật | SSO, MFA | Keycloak 26: OIDC + PKCE, một tài khoản nhiều tenant ([ADR #30](#adr-30)), OTP bắt buộc cho quản trị nền tảng | Có |
| | Két sắt mật mã | OpenBao: secret, AppRole riêng từng dịch vụ, transit mã hóa dữ liệu nhạy cảm ([ADR #25](#adr-25)) | Có |
| | Kiểm dịch tệp | Bucket kiểm dịch + bộ quét nội bộ luôn chạy; ClamAV tùy chọn; chưa có CDR | Một phần |
| | Chữ ký số, PKI, HSM | Ký Ed25519 bằng OpenBao cho biên nhận và bản neo kiểm toán; CA nội bộ cho Trino; chưa có chứng thư công cộng, HSM | Một phần |
| Đa thuê ước, biên mạng | Cửa ngõ API zero-trust | APISIX là điểm vào duy nhất, kiểm token tại biên, WAF ([ADR #34](#adr-34)); chưa có mTLS giữa dịch vụ | Một phần |
| | Che PII | Presidio với bộ nhận diện theo mẫu cho Việt Nam, bản che trong nhật ký và ô trao đổi ([ADR #43](#adr-43)) | Có |
| | Đa thuê ước | `tenant_id` + khóa kép + phân quyền theo dòng; Bệnh viện X là tenant riêng ([ADR #14](#adr-14)) | Có |
| | Bản địa hóa | Danh mục chuỗi i18n; tiếng Anh mới có ở phần khung giao diện | Một phần |
| Dữ liệu có cấu trúc | OLTP, API tự sinh, phân quyền theo dòng | PostgreSQL 17 + Hasura v2 CE (62 bảng/view, 99 Action) | Có |
| | Phiên bản, lịch sử dữ liệu | Nhật ký kiểm toán chuỗi hash; CDC vào Iceberg bronze | Có |
| | Đóng băng số liệu theo kỳ | `kpi.snapshot`, `kpi.freeze` | Có |
| | Lớp ngữ nghĩa báo cáo | Danh mục chỉ số và chiều sinh SQL trên Trino; chưa có giao diện | Một phần |
| Dữ liệu phi cấu trúc | Lưu trữ đối tượng, hồ sơ phê duyệt | SeaweedFS S3, tệp gắn với chứng từ, giữ tệp làm chứng cứ ([ADR #26](#adr-26)) | Có |
| | Chỉ mục toàn văn | Tika + Meilisearch, lọc lại theo quyền ([ADR #36](#adr-36)) | Có |
| | Trộn mẫu sinh biểu mẫu | Jinja2 + Gotenberg: phiếu đề nghị, quyết định nhân sự, báo cáo KPI ([ADR #37](#adr-37)) | Có |
| Quy trình, tự động hóa | BPMN | Flowable REST 8; thiết kế bằng bpmn-js, chạy thử sandbox, phát hành ([ADR #47](#adr-47)) | Có |
| | Kịch bản ngầm | Quy trình tự động: hẹn giờ, webhook, sự kiện nghiệp vụ; hành động có sẵn, chưa cho người dùng viết mã | Một phần |
| | Nạp dữ liệu theo lô | `/ingest/*` NDJSON/CSV, chạy thử, nguyên tử | Có |
| Vận hành, giám sát | Truy vết, nhật ký | `X-Request-Id` + `obs.log_event` (Vector); chưa có OpenTelemetry, Prometheus, Grafana | Một phần |
| | Kiểm toán bất biến | Chuỗi hash theo tenant, neo có chữ ký công bố ra ngoài CSDL ([ADR #33](#adr-33), [ADR #46](#adr-46)) | Có |
| | Trục sự kiện | Debezium Server + Kafka KRaft ([ADR #38](#adr-38)) | Có |
| | GitOps | Script đối chiếu `scripts/gitops/reconcile.sh`; không dùng Argo CD, Kubernetes | Một phần |
| | Sao lưu, khôi phục | Sao lưu theo lịch, diễn tập khôi phục có kiểm chuỗi hash | Có |
| Truyền thông | Định tuyến đa kênh | Email, SMS, webhook theo lựa chọn từng người | Có |
| | Thời gian thực | Subscription GraphQL qua websocket | Có |
| | Hàng đợi chống chối bỏ | `msg.queue` có thử lại, hàng chết, biên nhận Ed25519 gắn mã băm nội dung | Có |

## 5. Bốn nguyên lý

| Nguyên lý | Hiện thực | Mức |
|---|---|---|
| Phân tách theo vòng đời dữ liệu | OLTP trên PostgreSQL; CDC → Kafka → Iceberg bronze → view silver trên Trino ([ADR #39](#adr-39), [ADR #40](#adr-40)) | Có |
| Hội tụ IT/OT | Trang Bản sao số phòng sạch, chuỗi đo, ngưỡng, sự cố, ghi nhận sự cố; dữ liệu cảm biến nạp từ tệp demo, chưa có MQTT hay NGSI-LD ([ADR #50](#adr-50)) | Một phần |
| Quản trị dữ liệu thế hệ mới | Trang Phả hệ và chất lượng dữ liệu, báo sự cố dữ liệu; siêu dữ liệu nạp từ tệp demo, chưa thu từ pipeline | Một phần |
| Zero-Trust + GitOps | WAF và kiểm token tại biên, bucket kiểm dịch, mỗi dịch vụ một tài khoản CSDL và AppRole riêng ([ADR #35](#adr-35)), healthcheck và tự khởi động lại, script đối chiếu cấu hình; chưa có mTLS | Một phần |

## 6. Tầng 2: không gian H-P-D-I

| Không gian | Trang trong ứng dụng |
|---|---|
| [H] Con người số | Hộp việc (`/p/tasks`, `/p/inbox`), Ổ đĩa tài liệu (`/h/drive`), Thư viện tri thức (`/h/library`), Tiếp nhận nhân sự (`/h/onboarding`), Điều chuyển (`/h/transfer`), Quyết định nhân sự (`/h/decisions`), kênh nhận thông báo (`/settings/notifications`) |
| [P] Quy trình số | **Đề nghị mua sắm** (`/p/documents`, ứng dụng chính), Đơn hàng nội bộ (`/p/ic-orders`), Hồ sơ (`/p/records`), Thiết kế quy trình (`/p/process`), Quản trị tổ chức, người dùng, phân quyền, danh mục (`/admin/*`) |
| [D] Dữ liệu số | Trung tâm điều hành kèm bản đồ (`/d/ops`), Dịch vụ dữ liệu trên Lakehouse (`/d/services`), Bản sao số (`/d/twin`), Phả hệ dữ liệu (`/d/lineage`), Sổ cái (`/d/ledger`), Kiểm toán (`/admin/audit-logs`) |
| [I] Trí tuệ số | Tìm kiếm toàn văn và ngữ nghĩa (`/i/search`), Trợ lý RAG có trích dẫn (`/i/assistant`), Nhập liệu OCR (`/i/ocr`), Tác tử AI (`/i/agents`); mô hình chạy cục bộ ([ADR #51](#adr-51)) |

## 7. Tầng 3: định hướng

Bài thi không làm ứng dụng Tầng 3. Ứng dụng ngành cắm vào nền tảng theo cùng cách Tầng 2 đang dùng: đăng nhập Keycloak (OIDC),
gọi `/graphql` qua APISIX, lưu tệp vào S3 bằng link có chữ ký, nhận sự kiện từ Kafka hoặc `event.*`. Hệ thống tham khảo:

| Nhóm | Hệ thống | Tham khảo nguồn mở |
|---|---|---|
| Dòng chảy hàng hóa | OMS, WMS, POS, TMS | Odoo CE, ERPNext, OpenBoxes, OSRM + VROOM |
| Thời gian và dự án | PSA, Timesheet, CDE/BIM | OpenProject, Kimai, That Open Engine, IfcOpenShell |
| Trải nghiệm và thuê bao | eKYC/AML, LMS, EMR, CRM | Moodle, OpenEMR / HAPI FHIR, Twenty |
| Tài sản và không gian | MES/SCADA, BMS, Smart City | FUXA, Rapid SCADA, OpenRemote, ThingsBoard CE |
