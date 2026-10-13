# Lịch sử thay đổi

Mọi thay đổi đáng kể của dự án được ghi ở đây. Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## [Chưa phát hành]

**Nâng cấp:** container `db` khởi động lại một lần với `wal_level=logical`. Triển khai thật đặt thêm `CDC_DB_PASSWORD`, `LAKEHOUSE_DB_PASSWORD`. Cần thêm khoảng 2,3 GB RAM cho Kafka, Debezium, lakehouse-sink và Trino.

**Nâng cấp (nhà cung cấp đề xuất, hạn mức Ổ đĩa):** chạy lại như thường. Migration `018` thêm cột nhà cung cấp đề xuất cho đề nghị mua sắm và hạn mức dung lượng tenant (mặc định 10 GB); `seed` bổ sung vai trò `QUAN_LY_DU_LIEU_CHU` (quyền `mdm.manage`) cho CDO Tập đoàn X và Kế hoạch tổng hợp BVX; chạy lại `make trino-sql` để view silver có cột mới.

**Nâng cấp (sổ cái):** chạy lại như thường (`docker compose up -d`). Migration `017` thêm lịch sử đối soát và nhật ký phòng đọc (schema `audit`), `bootstrap` nạp metadata Hasura có các Action `ledger_*`. Liên kết cũ dạng `/d/ledger?code=…`, `/p/tasks?code=…` đổi thành `?doc=…`.

**Nâng cấp (đơn hàng nội bộ):** chạy lại như thường. Migration `014` thêm schema `mfg` (lô) vào publication CDC; `seed` bổ sung lô của Chip X, vai trò `BAN_HANG_NOI_BO` cho khối kinh doanh và một đơn nội bộ đã giao vào dữ liệu demo có sẵn. Bản chạy từ mã nguồn: `docker compose up -d --build` để Debezium đọc thêm schema `mfg`.

**Nâng cấp (bảo mật trục dữ liệu):** `docker compose up -d --build` (image mới `bamboo-kafka`). Triển khai thật đặt thêm `DEBEZIUM_KAFKA_PASSWORD`, `LAKEHOUSE_KAFKA_PASSWORD`. `openbao-init` tạo CA nội bộ, cấp chứng chỉ và mật khẩu cho Trino; giao diện web Trino trên máy dev chuyển sang `https://127.0.0.1:8085` (mật khẩu: `make trino-password`). Migration `016` thêm quyền `data.lakehouse.read`; `seed` bổ sung vai trò `PHAN_TICH_DU_LIEU` vào dữ liệu demo có sẵn.

**Nâng cấp (tiếp nhận nhân sự):** chạy lại như thường (`docker compose up -d`). Migration `013` tạo schema `hr`; `seed` bổ sung phòng nhân sự, vai trò `NHAN_SU`, quy tắc duyệt `ONBOARDING` và ghế tuyển mới vào dữ liệu demo có sẵn; `openbao-init` sinh secret cho client Keycloak `bms-provisioner`, `bootstrap` tạo client đó và thêm các tài khoản demo nhân sự còn thiếu vào realm (cần `DEMO_PASSWORD` như lần cài đầu).

### Thêm
- Đề nghị mua sắm: ô **Nhà cung cấp đề xuất** gõ để tìm; chưa có trong danh mục thì chọn "Dùng nhà cung cấp mới" và ghi mã số thuế. Người có `mdm.manage` thấy danh sách nhà cung cấp đề xuất ở **Danh mục & dữ liệu chủ → Nhà cung cấp**, đặt mã rồi thêm vào danh mục (cùng mã số thuế thì dùng lại nhà cung cấp có sẵn, mọi đề nghị đề xuất cùng nhà cung cấp tự chuyển sang). Ô **Nhóm hàng** gõ để tìm. Phiếu PDF và tìm kiếm có tên nhà cung cấp đề xuất. Action `adopt_proposed_partner`, `proposed_partners`.
- Ổ đĩa tài liệu: **hạn mức dung lượng** theo tenant (mặc định 10 GB), thẻ Dung lượng hiện đã dùng / hạn mức / còn khả dụng, người có `core.org.manage` đổi được; vượt hạn mức thì không cấp link tải lên (`file-quota`). Nút **Tải lên** ở thư mục gốc hỏi chứng từ nhận tệp rồi tải. Action `drive_usage`.
- Trang **Sổ cái** `/d/ledger` dùng dữ liệu thật (ADR #46), thay dữ liệu minh họa Hyperledger Fabric: bản niêm phong của mỗi tệp đính kèm là SHA-256 ghi lúc tệp được nhận, nằm trong chuỗi hash nhật ký kiểm toán. **Đối soát** theo số chứng từ (máy chủ đọc lại tệp trong kho, tính lại SHA-256, kiểm mắt xích chuỗi hash) hoặc theo tệp (băm ngay trên trình duyệt); kết quả ghi lịch sử, có bằng chứng sao chép được, chứng nhận PDF, báo cáo CSV; người có `audit.read` kiểm được toàn chuỗi. **Phòng đọc ảo**: tệp của chứng từ đã kết thúc, xem trực tiếp (PDF, ảnh, văn bản) với dấu chìm tên người xem, link hạn 60 giây, mỗi lần mở ghi nhật ký truy cập. Action `ledger_overview`, `ledger_verify`, `ledger_archive`, `ledger_open_archive`; migration `017` (`audit.ledger_check`, `audit.archive_access` chỉ ghi thêm). Mở thẳng một hồ sơ: `/d/ledger?doc=PR-2026-000012`.
- Trang **Dịch vụ dữ liệu** `/d/services` dùng dữ liệu thật (ADR #45): danh mục tập dữ liệu Lakehouse (tầng silver) của công ty đang chọn, lược đồ, số dòng, 20 dòng thay đổi gần nhất đã che dữ liệu cá nhân, ví dụ truy vấn, nguồn dữ liệu. Cần quyền mới `data.lakehouse.read` (vai trò demo Phân tích dữ liệu cho CDO Tập đoàn X và Kế hoạch tổng hợp Bệnh viện X); Action `lakehouse_datasets`, `lakehouse_preview`. Bỏ dữ liệu minh họa và nút "Yêu cầu quyền truy cập" chưa có xử lý thật.
- Quản trị dữ liệu tenant trên giao diện (ADR #44): **Cơ cấu tổ chức** `/admin/org` (cây đơn vị, vị trí, người giữ ghế; thêm / sửa / chuyển / ngừng, bổ nhiệm), **Người dùng** `/admin/people` (thêm người, tạo hoặc liên kết tài khoản Keycloak với mật khẩu tạm hiện một lần, bổ nhiệm), **Vai trò & phân quyền** `/admin/roles` (bộ quyền theo phân hệ, cấp vai trò cho vị trí / đơn vị / người ngoài cây với phạm vi và thời hạn), **Danh mục & dữ liệu chủ** `/admin/catalog` (loại đơn vị, chức danh, nhóm vật tư, nhà cung cấp, vật tư). Nhập hàng loạt từ Excel / CSV với tệp mẫu, xem trước lỗi từng dòng (chạy thật trong giao dịch rồi hoàn tác), chỉ ghi khi mọi dòng hợp lệ. Action `admin_save`, `admin_close`, `create_person_accounts`, `admin_import`, `admin_import_template`; migration `015` (view `core.v_admin`, nhật ký cho `core.catalog_item`); thêm thư viện `openpyxl` cho actions.
- Giao diện mới dùng dữ liệu thật: **Hộp việc** `/p/tasks` (việc của tôi kể cả ủy quyền, việc cả nhóm chỉ xem, duyệt / trả lại / từ chối qua `act_on_task`), **Trang chủ** (việc, chứng từ tôi lập, thông báo), **Hồ sơ** `/p/records` (chứng từ được xem, chuỗi duyệt), **Ổ đĩa tài liệu** `/h/drive` (thư mục = chứng từ, tải lên có kiểm dịch), **Trung tâm điều hành** `/d/ops` (KPI và biểu đồ duyệt theo đơn vị cấp 1). Hạn SLA tạm tính 48 giờ từ lúc giao việc; KPI đã ghim trên Trang chủ và bản đồ cảnh báo thiết bị vẫn là số minh họa, có nhãn.
- Đơn hàng nội bộ (ADR #42): đề nghị mua sắm chọn nhà cung cấp nội bộ (ví dụ Điện thoại X mua PMIC của Chip X) duyệt xong tự sinh **đơn hàng nội bộ** `IC-…`; khối kinh doanh bên bán nhận thông báo, chọn **lô xuất** cho từng dòng rồi xác nhận (kiểm tra lô của công ty bán, đúng mặt hàng, không bị giữ, còn đủ số lượng) hoặc từ chối kèm lý do; người đặt hủy được khi đơn còn chờ. Xác nhận xong tự sinh **đơn mua** `PO-…` cho bên mua, dòng hàng mang lô nhận về. Giao diện `/p/ic-orders` (lọc "Chờ tôi xác nhận"), đề nghị hiện đơn nội bộ kèm trạng thái, nhà cung cấp nội bộ đánh dấu "(nội bộ)". Lô (`mfg.lot`) vào CDC và Lakehouse (view `silver.mfg_lot`).
- Che dữ liệu cá nhân bằng Microsoft Presidio (ADR #43): nhận diện số CCCD, CMND, số điện thoại, số tài khoản, email, số thẻ trong văn bản tiếng Việt (không cần mô hình NER). **Nhật ký kiểm toán** chỉ hiện dữ liệu trước/sau đã che (Hasura không còn trả bản gốc; Action `audit_log_detail`), kèm nhãn "Đã che: …". **Ô trao đổi** cảnh báo trước khi gửi nội dung có dữ liệu cá nhân, cho chọn gửi bản đã che hoặc nguyên văn (Action `check_pii`).
- Phiếu đề nghị mua sắm dạng PDF (ADR #37): query `get_purchase_request_pdf` trả link tải phiếu khổ A4 gồm thông tin đề nghị, dòng hàng, tổng tiền bằng chữ, chuỗi phê duyệt, chữ chìm trạng thái khi chưa duyệt, chân trang có số chứng từ, mã kiểm tra và số trang. Chỉ người xem được chứng từ mới in được; cùng nội dung thì dùng lại tệp đã in. Dịch vụ mới `gotenberg` (bản Chromium, chỉ mạng nội bộ, chặn mọi truy cập mạng khi in).
- Giao diện nối nốt các Action còn thiếu: trang **Tìm kiếm** `/i/search` (gõ tới đâu tìm tới đó, lọc đề nghị/tệp đính kèm, đoạn trích tô chữ khớp, tải tệp khớp, từ khóa giữ trên URL); nút **In phiếu** trên chi tiết đề nghị tải PDF `<số chứng từ>.pdf`; trang **Sơ đồ quy trình** `/p/process/:id` vẽ BPMN bằng bpmn-js, tô bước đang chạy và bước đã qua, kèm danh sách bước duyệt. bpmn-js tách chunk riêng, chỉ tải khi mở sơ đồ.
- Tiếp nhận nhân sự (ADR #41): phòng nhân sự lập **đề nghị tiếp nhận** (ứng viên, vị trí còn trống, ngày vào làm, loại hợp đồng, lương, tên đăng nhập) và gửi duyệt; chuỗi duyệt tính từ vị trí được bổ nhiệm (quản lý trực tiếp của vị trí rồi giám đốc công ty). Duyệt xong tự tạo người (mã `NV-…`), bổ nhiệm giữ chính từ ngày vào làm và tài khoản Keycloak với mật khẩu tạm bắt đổi ở lần đăng nhập đầu (client riêng `bms-provisioner` chỉ quản lý người dùng). CCCD, số tài khoản, địa chỉ mã hóa bằng khóa `pii` của OpenBao, người duyệt chỉ thấy bản che, phòng nhân sự **Xem đầy đủ** có ghi nhật ký kiểm toán. Giao diện `/h/onboarding` (danh sách, form, chi tiết kèm CV, trao đổi); hộp việc và thông báo nhận cả loại chứng từ mới. Tài khoản demo `ns.dienthoai`, `ns.chip`, `ns.giadung`, `ns.benhvien`.
- CDC (ADR #38): Debezium Server đọc WAL logic của CSDL `bms` và ghi mọi thay đổi của các schema nghiệp vụ vào Kafka (KRaft một node), topic `bms.<schema>.<bảng>` dạng JSON; lần đầu chụp ảnh toàn bộ. Migration 012: publication `bms_cdc` theo schema (bảng mới tự vào), không gồm nhật ký kiểm toán và hàng đợi tìm kiếm; role `bamboo_cdc` chỉ đọc có quyền replication; nhịp tim 10 giây để replication slot không giữ WAL, giới hạn 1 GB WAL cho slot.
- Lakehouse bronze (ADR #39): dịch vụ `lakehouse-sink` ghi mọi thay đổi từ Kafka vào bảng Iceberg `bronze.<schema>_<bảng>` (lịch sử đầy đủ, kể cả dòng đã sửa, xóa ở CSDL nghiệp vụ) trên bucket `bms-lakehouse`, phân vùng theo ngày; catalog JDBC ở CSDL `lakehouse`. Ghi đúng một lần nhờ lưu vị trí Kafka trong snapshot Iceberg. Image mới `bamboo-lakehouse`.
- Tầng silver và Trino (ADR #40): view `lakehouse.silver.<schema>_<bảng>` trả trạng thái hiện tại của từng bảng nghiệp vụ với kiểu cột như PostgreSQL, sinh từ CSDL (`make trino-sql`, `platform/trino/silver.sql`); Trino một node đọc cùng catalog Iceberg, giao diện web ở `127.0.0.1:8085`. Image mới `bamboo-trino`.

### Hiệu năng
- Dịch vụ `actions` chạy mỗi Action ở threadpool thay vì trên event loop. Trước đây một Action chậm (in phiếu PDF, gọi Flowable, S3) chặn mọi request khác của tiến trình, kể cả auth webhook mà Hasura gọi ở **mọi** request GraphQL. uvicorn dùng `uvloop` và `httptools`, không ghi access log (Hasura và cổng API đã ghi).
- Ghim heap của các JVM. Container không giới hạn bộ nhớ nên Keycloak mặc định lấy heap ban đầu bằng 50% RAM **của cả máy**; Tika, Debezium lấy tối đa 1/4. Nay: Keycloak 128–768 MB, Tika 512 MB, Debezium 384 MB, chỉnh được qua `KEYCLOAK_HEAP`, `TIKA_JAVA_OPTS`, `DEBEZIUM_JAVA_OPTS` (docs/van-hanh/trien-khai.md mục 8).
- PostgreSQL tắt JIT (`jit=off`): câu SQL lớn Hasura sinh ra không mất hàng trăm ms biên dịch JIT.
- Giao diện: JavaScript, CSS nén gzip mức 9 sẵn lúc build, nginx gửi thẳng tệp `.gz` (`gzip_static`) thay vì nén lại 2 MB mỗi lượt tải.
- Image Python biên dịch sẵn bytecode của mã dịch vụ.

### Thay đổi
- Mọi dịch vụ chạy lâu dài có cổng hiện trên Docker, chỉ nghe `127.0.0.1` của máy chạy compose: actions 8090, web 8088 (không qua cổng API), SeaweedFS 8333 / 9333 / 8888, Meilisearch 7700, Tika 9998, Gotenberg 3000, Debezium 8083, ClamAV 3310 (profile `scan`). Kafka thêm listener `HOST` `localhost:19092` (cùng SCRAM + ACL) cho công cụ trên máy dev. `flow-sync`, `search-sync`, `lakehouse-sink` là tiến trình nền, không nghe cổng.

### Sửa
- Dịch vụ actions không khởi động được nếu thiếu tệp CA của Trino (chạy ngoài compose, volume chưa ghi): nay chỉ ghi cảnh báo, các Action Lakehouse trả 503, các Action khác chạy bình thường.
- README ghi Trino không mật khẩu ở `http://localhost:8085`; đúng là `https://localhost:8085`, tài khoản `bms-admin` (`make trino-password`).
- Dữ liệu demo không có ai giữ quyền `mdm.manage`, nên tab Nhà cung cấp / Vật tư ở trang Danh mục không hiện với ai: thêm vai trò Quản lý dữ liệu chủ.
- Tệp mẫu nhập Excel để dòng ví dụ ngay dưới tiêu đề, giữ nguyên mà nhập thì dòng ví dụ cũng bị nhập (đơn vị cha `CTY_A` không tồn tại nên báo lỗi): dòng ví dụ chuyển sang trang tính "Ví dụ", trang "Dữ liệu" chỉ có tiêu đề.
- Nút **Hủy** trên trang chi tiết đề nghị mua sắm không mở hộp xác nhận (`Modal.confirm` tĩnh của antd v5 không hiển thị trên React 19): dùng `modal` của `App.useApp()`.
- Liên kết vào Hộp việc `/p/tasks?code=PR-…` (từ Trang chủ, trang Hồ sơ) mở trực tiếp hoặc tải lại trang thì Keycloak báo `redirect_uri` không hợp lệ: tham số `code` trùng tham số OAuth mà keycloak-js đọc. Đổi thành `?doc=`.
- Nhập hàng loạt: tệp mẫu tải về từ trang quản trị không nhập lại được (tiêu đề cột bắt buộc có dấu ` *` nên báo "Thiếu cột"). Ô Excel kiểu số (mã nhân viên, mã số thuế) không còn thành `1001.0`, ô ngày Excel so sánh được với ngày gõ tay; CSV một cột không còn lỗi máy chủ.
- flow-sync: Flowable tạm thời không truy cập được thì không còn thử lại liên tục hết 20 lượt trong vài giây rồi bỏ dở lần gửi duyệt; mỗi lượt thử cách nhau tới khi có thông báo mới hoặc sau 30 giây.
- Dịch vụ actions: body không phải JSON trả 400 thay vì 500; mã bí mật Hasura → actions so sánh thời gian hằng; ClamAV trả lời lạ thì giữ tệp ở trạng thái chờ quét (503) thay vì lỗi 500.
- Giao diện: khoảng hiệu lực (tstzrange) ở trang quản trị và form tiếp nhận nhân sự đọc sai trên Safari / Firefox (chuỗi thời gian PostgreSQL `2026-10-01 05:00:00+00`); tham số `to` của trang đăng nhập chỉ nhận đường dẫn nội bộ.
- Trang đăng nhập thỉnh thoảng báo `403 Forbidden` (cổng API): cookie phiên của Keycloak là chuỗi ngẫu nhiên, đôi khi tình cờ chứa mẫu mà WAF coi là tấn công (tên hàm PHP, giá trị bọc nháy kép), khoảng 1/1500 lượt mở trang đăng nhập. WAF không kiểm các cookie phiên Keycloak nữa (Keycloak tự kiểm chúng); cookie khác, tham số và nội dung vẫn qua OWASP CRS như cũ.

### Bảo mật
- Kafka bật xác thực SCRAM-SHA-512 và ACL (ADR #45): mỗi dịch vụ một tài khoản (`debezium` chỉ ghi topic CDC, `lakehouse` chỉ đọc), client không có tài khoản hoặc topic ngoài quyền bị từ chối; controller và listener quản trị chỉ nghe trong container.
- Trino chỉ nhận đăng nhập qua HTTPS bằng chứng chỉ do CA nội bộ của OpenBao cấp, tài khoản dịch vụ `bms-admin`, `bms-actions` (mật khẩu OpenBao sinh). Quyền theo tenant: actions truy vấn dưới danh nghĩa người dùng của tenant, Trino tự thêm row filter về đúng tenant cho mọi view silver; bronze và bảng không thuộc tenant nào bị chặn. Quyền sinh cùng `silver.sql` từ cấu trúc CSDL (`platform/trino/rules.json`).

## [0.3.0] - 2026-10-05

Tìm kiếm toàn văn, mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu, đăng nhập được sau khi nâng cấp. Gồm cả các sửa lỗi ghi ở mục 0.2.1 trước đây (chưa từng phát hành riêng).

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.3.0 up -d -y   # mở http://localhost:8000
```

**Nâng cấp từ 0.1.0 hoặc 0.2.0:** sao lưu (`scripts/ops/backup.sh` hoặc `scripts\ops\backup.ps1`), rồi chạy lệnh trên (hoặc `git pull && docker compose up -d --build` khi chạy từ mã nguồn). Dữ liệu demo giữ nguyên:
- Job `migrate` tự tạo tài khoản CSDL cho từng dịch vụ và chuyển chủ sở hữu CSDL Keycloak, Flowable, metadata Hasura sang tài khoản mới. Triển khai thật (`BAMBOO_ENV=production`) phải đặt thêm `HASURA_DB_PASSWORD`, `ACTIONS_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `FLOWABLE_DB_PASSWORD`; máy dev dùng giá trị mặc định.
- Migration `011` đánh dấu mọi đề nghị và tệp sạch hiện có; `search-sync` đưa vào chỉ mục tìm kiếm trong lần chạy đầu. Cần thêm khoảng 300 MB RAM cho Meilisearch và Tika.
- Image cũ trên máy chạy với tệp compose mới thì Hasura, Keycloak, Flowable khởi động lại liên tục (`password authentication failed`): kéo image mới (`docker compose pull`) hoặc build lại (`--build`).

### Thêm
- Tìm kiếm toàn văn (ADR #36): Action `search_documents` tìm đề nghị mua sắm (số chứng từ, tiêu đề, mô tả, dòng hàng, nhà cung cấp, người lập, đơn vị) và nội dung tệp đính kèm đã kiểm tra (PDF, DOCX, XLSX, TXT); gõ tiếng Việt không dấu vẫn tìm được, đoạn trích đánh dấu chữ khớp. Chỉ trả chứng từ người gọi xem được: quyền kiểm tra lại trong CSDL cho từng kết quả. Dịch vụ mới `meilisearch` (bản Community, MIT), `tika` (trích chữ) và `search-sync` (đồng bộ CSDL → chỉ mục bằng trigger, tự dựng lại chỉ mục trống). Khóa chủ Meilisearch do OpenBao sinh; khóa chỉ tìm cho `actions`, khóa ghi chỉ mục và định danh S3 chỉ đọc cho `search-sync` (AppRole `search`).
- Script sao lưu `scripts/ops/backup.sh` và `scripts/ops/backup.ps1`: CSDL (`pg_dumpall`), két OpenBao (dữ liệu và khóa), tệp đính kèm SeaweedFS.

### Thay đổi
- SeaweedFS tự nạp lại định danh S3 khi `openbao-init` ghi `s3.json` mới (healthcheck gửi `SIGHUP`), không phải khởi động lại khi nâng cấp.

### Sửa
- Keycloak báo `Invalid parameter: redirect_uri` sau khi nâng cấp 0.1.0 → 0.2.0: realm đã import ở lần chạy đầu giữ redirect URI cũ (`http://localhost:5173`). Job `bootstrap` nay bổ sung `WEB_ORIGIN` vào redirect URI, web origin và URI sau đăng xuất của client `bms-web` qua Admin API mỗi lần khởi động (chỉ thêm, không xóa; tài khoản quản trị đọc từ OpenBao `bms/keycloak`).

### Bảo mật
- Mỗi dịch vụ một tài khoản CSDL đặc quyền tối thiểu thay cho superuser `bms` (ADR #35): Hasura và actions chỉ đọc/ghi dữ liệu nghiệp vụ, không đổi cấu trúc, không TRUNCATE, không chạy lệnh trên máy chủ CSDL; Keycloak, Flowable, Hasura (metadata) là chủ CSDL riêng của mình và chỉ chủ sở hữu kết nối được. Nhật ký kiểm toán chỉ đọc với ứng dụng: trigger ghi chuỗi hash chạy `SECURITY DEFINER`, ứng dụng không tự ghi, sửa, xóa hay tắt trigger chỉ-ghi-thêm được. Kiểm thử `db/tests/bms_100_vai_tro.sql`; kiểm thử tích hợp chạy actions và Hasura bằng tài khoản ứng dụng.

## [0.2.0] - 2026-10-04

Cổng API Apache APISIX trở thành điểm vào duy nhất của hệ thống.

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.2.0 up -d -y   # mở http://localhost:8000
```

**Nâng cấp từ 0.1.0:** địa chỉ ứng dụng đổi từ `http://localhost:5173` sang `http://localhost:8000`. Keycloak chỉ import realm ở lần chạy đầu, nên máy đã chạy 0.1.0 cần thêm `http://localhost:8000/*` vào *Valid redirect URIs* và `http://localhost:8000` vào *Web origins* của client `bms-web` trong Keycloak (từ 0.3.0 việc này tự động, xem trên). Triển khai thật: một tên miền trỏ vào cổng và đặt `WEB_ORIGIN`, `KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT`, `CORS_ORIGINS` theo tên miền đó.

### Thêm
- Cổng API Apache APISIX là điểm vào duy nhất từ trình duyệt (`http://localhost:8000`, ADR #34): định tuyến tới web, Keycloak, Hasura, SeaweedFS; token Keycloak kiểm tại biên (`forward-auth`); WAF Coraza với OWASP CRS; giới hạn tần suất GraphQL và đăng nhập; chặn realm quản trị Keycloak, Hasura Admin API và thao tác S3 ngoài hai bucket của ứng dụng; `X-Request-Id`, số liệu Prometheus nội bộ. Image `bamboo-gateway`, kiểm thử `make test-gateway`.

### Thay đổi
- Web và SeaweedFS không còn mở cổng ra ngoài; địa chỉ công khai mặc định chuyển sang cổng API (`KEYCLOAK_URL`, `HASURA_PUBLIC_URL`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN`); giao diện gọi API cùng origin; redirect URI của Keycloak lấy từ `WEB_ORIGIN` khi import realm. Trang quản trị Keycloak tách riêng ở cổng 8080.

## [0.1.0] - 2026-10-04

Bản phát hành đầu tiên: nền tảng lõi (Keycloak, Hasura, PostgreSQL, Flowable, SeaweedFS, OpenBao) và ứng dụng Đề nghị mua sắm cho kịch bản Tập đoàn X, chạy bằng một lệnh.

```bash
docker compose -f oci://ghcr.io/thanhnlt/bamboo:0.1.0 up -d -y
```

### Thêm
- Cơ cấu tổ chức là dữ liệu: đơn vị (cây `ltree`), vị trí, người, bốn loại bổ nhiệm (giữ chính, kiêm nhiệm, quyền trưởng, hợp đồng), vai trò, ủy quyền một phần; khóa kép chặn tham chiếu chéo tenant (ADR #5, #14, #29, #30).
- Chuỗi duyệt chốt theo vị trí, tìm người khi đến bước; đẩy lên cấp trên, gộp bước, chuyển việc khi bổ nhiệm thay đổi; hạn mức duyệt theo loại đơn vị (ADR #17, #28).
- Lớp API Hasura sinh metadata tự động, quyền xem chi tiết bằng computed field `can_read`; Hasura Actions gửi duyệt, duyệt/từ chối/trả về; Flowable phản chiếu luồng duyệt qua `flow-sync` (ADR #24, #31).
- Keycloak chỉ xác thực, Hasura xác thực bằng webhook (token + tenant đã chọn); một tài khoản cho nhiều tenant cùng công ty mẹ; dữ liệu demo Tập đoàn X và realm sinh tự động (ADR #23, #30, #32).
- Mua sắm: nhà cung cấp, vật tư, số chứng từ `PR-YYYY-NNNNNN`, dòng hàng (tổng tiền tự tính, khóa sau khi gửi duyệt), người lập hủy đề nghị.
- Nhật ký kiểm toán nối chuỗi hash theo tenant, chỉ ghi thêm, Action `verify_audit_chain` (ADR #18, #33).
- Bình luận (nhắc tên, trả lời, xóa mềm) và thông báo sinh bằng trigger + `pg_notify` (ADR #20).
- Tệp đính kèm qua SeaweedFS: link có chữ ký vào bucket cách ly, kiểm tra kích thước và chữ ký đầu tệp, sha256, quét ClamAV tùy chọn (ADR #26).
- OpenBao lưu bền: khởi tạo/unseal tự động, AppRole đặc quyền tối thiểu cho từng dịch vụ, khóa S3 do két sinh, transit mã hóa PII (ADR #25).
- Action `process_state` trả sơ đồ BPMN và bước hiện tại cho bpmn-js.
- Ứng dụng Refine (Tầng 2) nối với backend: đăng nhập Keycloak, chọn tenant cho tài khoản nhiều tenant, danh sách/lập/sửa/chi tiết đề nghị mua sắm kèm dòng hàng, gửi duyệt, hủy, chuỗi duyệt và lịch sử, tệp đính kèm (hiện kết quả kiểm tra, quét virus), trao đổi, hộp việc duyệt (cả duyệt thay), chuông thông báo tự cập nhật, nhật ký kiểm toán và đối soát chuỗi hash; menu theo quyền thật; giao diện tiếng Việt.
- Kiểm thử đầu–cuối bằng Playwright (`npm run test:e2e`) trên stack thật.
- Toàn bộ hệ thống chạy bằng một lệnh `docker compose up -d`: healthcheck cho mọi dịch vụ chạy lâu, khởi động theo trạng thái healthy, tự khởi động lại (ADR #13).
- README, NOTICE, `.env.example`, header SPDX cho mọi tệp (chuẩn REUSE 3.3).
- Image dựng sẵn trên GHCR (amd64 + arm64) và tệp compose phát hành dạng OCI artifact: `docker compose -f oci://ghcr.io/thanhnlt/bamboo:<phiên bản> up -d -y` chạy toàn bộ hệ thống không cần mã nguồn; migration, realm Keycloak, cấu hình OpenBao đóng gói vào image.

- Sẵn sàng production: `BAMBOO_ENV=production` từ chối khởi động khi còn mật khẩu mặc định; container Python chạy bằng uid 10001; image `web` đọc địa chỉ Keycloak/Hasura lúc khởi động (`/config.js`); nginx nén gzip, header bảo mật, không cache `index.html`; xoay vòng log mọi container; Hasura Console và CORS, địa chỉ và chế độ chạy Keycloak cấu hình được; nhãn OCI cho mọi image.
- Tài liệu triển khai production (tên miền TLS, sao lưu/khôi phục, nâng cấp, khóa OpenBao), SECURITY.md, mẫu báo lỗi và đề xuất trên GitHub Issues.

### Sửa
- Frontend gọi Keycloak/Hasura demo bên ngoài thay vì stack của dự án; 12 lỗi ESLint.
- Gỡ trang mẫu blog, `axios`, `@uiw/react-md-editor` không dùng; tách thư viện vào chunk `vendor` riêng (mã ứng dụng 45 kB, đổi mã không phải tải lại thư viện).
- Gỡ `@refinedev/devtools` (kéo theo gói `@aliemir/dom-to-fiber-utils` không có giấy phép) và các gói `@typescript-eslint` v5 xung đột với ESLint 9; chuyển `@refinedev/cli` sang devDependencies.
- Dockerfile giao diện: Node 22 (react-router 7 cần Node ≥ 20), phục vụ bằng nginx có fallback định tuyến SPA.
- `openbao-init` chờ `sys/init` tới 5 phút (raft chậm, hết giờ giữa chừng là mất khóa) và dừng rõ ràng khi thiếu file khóa.
- `.dockerignore` để build image Python không gửi `node_modules` và tài liệu vào build context.

[Chưa phát hành]: https://github.com/ThanhNLT/Bamboo/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ThanhNLT/Bamboo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ThanhNLT/Bamboo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ThanhNLT/Bamboo/releases/tag/v0.1.0
