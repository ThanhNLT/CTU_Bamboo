# Dữ liệu demo nhóm 5: Bản sao số, Phả hệ dữ liệu, KPI ghim Trang chủ

Các tệp ở đây là dữ liệu mẫu cho ba trang còn minh họa: **Bản sao số** `/d/twin`, **Phả hệ dữ liệu** `/d/lineage`
và khối **KPI đã ghim** ở Trang chủ. Chúng khớp với dữ liệu demo của `app.seed`: mã tenant (`TDX`, `BVX`), mã đơn vị
(`CHIP_PS`, `DT_NM`, `BVX_DUOC`...) và tài khoản (`tgd`, `cdo`, `gd.benhvien`...).

Không sửa tay. Mọi tệp sinh bằng script, có hạt giống ngẫu nhiên cố định nên chạy lại ra đúng nội dung cũ:

```bash
cd services/seed
python -m app.demo_files            # ghi vào services/seed/data/demo/
```

Kiểm thử `tests/test_demo_files.py` báo lỗi khi tệp đã commit khác kết quả của script. Nạp vào CSDL: `app.demo_load` (seed tự gọi; `python -m app.demo_load --refresh` để nạp lại theo giờ hiện tại), xem ADR #50.

## Mốc thời gian

Mọi mốc thời gian tính quanh **REF = 2026-10-14T10:30:00+07:00** ("bây giờ" của bộ dữ liệu). Khi nạp, bộ nạp cộng
`(bây giờ − REF)` vào mọi cột thời gian để sự cố và chuỗi đo luôn trông như vừa xảy ra.

## Bản sao số (`ban-sao-so/`)

26 thực thể theo NGSI-LD: 4 phòng sạch (Chip X), 8 dây chuyền SMT (Điện thoại X), 14 thiết bị y tế (Bệnh viện X).

| Tệp | Nội dung |
|---|---|
| `mo-hinh.json` | Mô hình của 6 loại thực thể (`CleanRoom`, `SmtLine`, `Ventilator`, `PatientMonitor`, `ColdStorage`, `InfusionPump`): thuộc tính, nhãn, đơn vị, số chữ số thập phân, ngưỡng `min` / `max` |
| `co-so.csv` | Cơ sở đặt thiết bị: tenant, mã đơn vị, tỉnh, tọa độ |
| `thuc-the.jsonld` | Thực thể NGSI-LD dạng `@graph` (nạp được vào context broker, ví dụ Scorpio, qua `POST /ngsi-ld/v1/entityOperations/upsert`): giá trị mới nhất của từng thuộc tính kèm `observedAt`, `unitText` (`unitCode` theo UN/CEFACT khi có mã chuẩn), quan hệ `site`, trạng thái kết nối |
| `do-luong.csv` | Chuỗi đo 24 giờ, mỗi 5 phút: `observed_at, entity_id, attribute, value` (~45 nghìn dòng). Thiết bị mất tín hiệu (CR-04: 2 phút, BT-02: 6 phút) không có điểm cuối |
| `su-co.csv` | Các đoạn vượt ngưỡng tính từ chuỗi đo: thuộc tính, phía vượt, ngưỡng, bắt đầu / kết thúc, số phút, đỉnh, mức độ (`critical` là sự cố đã khai báo, `warning` là vượt ngưỡng thường), trạng thái `open` / `closed` |

Các tình huống dựng sẵn để demo:

- **CR-02** (phòng sạch ISO 5): chênh áp tụt dưới 10 Pa từ 34 phút trước, hạt bụi ≥0,5 µm vượt 3.520/m³ khoảng 15 phút rồi hồi về 3.120 (sát ngưỡng). Có thêm một lần vượt đêm trước.
- **SMT-BG-03**: tỷ lệ lỗi AOI vọt lên 0,72% trong 15 phút. **SMT-TN-02**: lò reflow đang quá nhiệt (252 °C, ngưỡng 250).
- **TL-02** (tủ vắc-xin Khoa Dược): nhiệt độ lên 9,1 °C khoảng 20 phút, hay mở cửa. **MT-04**: pin dự phòng còn 24%. **MON-03**: Wi-Fi yếu (−79 dBm).

## Phả hệ dữ liệu (`pha-he-du-lieu/`)

Đường đi thật của dữ liệu Bamboo: bảng PostgreSQL `bms` → topic Kafka do Debezium ghi (`bms.<schema>.<bảng>`) → view
silver trên Iceberg (`lakehouse.silver.<schema>_<bảng>`) → bảng tổng hợp gold (Trino) → KPI và trang ứng dụng. Kèm
nhánh đo lường thiết bị: thực thể NGSI-LD → `iot.telemetry` → `silver.iot_telemetry_5m`.

| Tệp | Nội dung |
|---|---|
| `nut.csv` | 32 nút theo 5 tầng (`source`, `stream`, `lake`, `serving`, `consumer`): công nghệ, tên kỹ thuật, FQN, tiêu đề, chủ sở hữu, nơi dùng, đường dẫn mở trong ứng dụng |
| `canh.csv` | Quan hệ nguồn → đích kèm ánh xạ cột (`nguồn→đích; …`) cho chế độ phả hệ mức cột |
| `kiem-tra.csv` | Kết quả kiểm tra chất lượng kiểu Soda trên từng nút |
| `lan-chay.csv` | Các lần chạy pipeline gần đây: tác vụ, công cụ, nút, bắt đầu, thời lượng, kết quả (`success`, `check_failed`, `running`) |

Tình huống dựng sẵn: kiểm tra `closed_at không rỗng với việc đã xong` trên `silver.wf_task` **lỗi 37 dòng**. Trạng
thái "bị ảnh hưởng" lan xuống `gold.approval_daily`, KPI **Duyệt đúng hạn**, **Giá trị mua sắm đã duyệt** và Trung
tâm điều hành.

## KPI ghim Trang chủ (`kpi/`)

| Tệp | Nội dung |
|---|---|
| `dinh-nghia.csv` | 8 KPI theo tenant: nhãn, đơn vị, hướng tốt (`up` / `down` / `neutral`), ngưỡng, độ chi tiết (`hour`, `day`, `week`, `month`), nút phả hệ tương ứng, định nghĩa |
| `gia-tri.csv` | Chuỗi giá trị cho sparkline: 12 tháng, 12 tuần, 14 ngày hoặc 12 giờ. KPI hạt bụi CR-02 tính từ `do-luong.csv` nên khớp với Bản sao số |
| `ghim.csv` | KPI mỗi tài khoản demo ghim lên Trang chủ, theo thứ tự |

Riêng Bệnh viện X: KPI chỉ là số tổng hợp (tỷ lệ thời gian tủ đạt nhiệt, số máy thở sẵn sàng), không có dữ liệu
người bệnh (ADR #22).
