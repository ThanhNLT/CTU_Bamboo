# API cho giao diện (Hasura GraphQL)

Giao diện Refine chỉ gọi một endpoint GraphQL của Hasura (sau này qua APISIX). Trang này liệt kê
những gì backend đang có, ánh xạ sang các màn hình trong [Thiết kế giao diện](07-thiet-ke-UI.md).
Schema đầy đủ: Hasura Console (`http://localhost:8081`) hoặc introspection; sinh type bằng graphql-codegen.

## 1. Kết nối và phiên

| Bước | Header | Role Hasura | Gọi được |
|---|---|---|---|
| Đăng nhập Keycloak (client `bms-web`, PKCE) | `Authorization: Bearer <access token>` | `account` | chỉ query `my_tenants` |
| Chọn tenant | thêm `x-bamboo-tenant: <tenant_id>` | `user` | toàn bộ API dưới đây |
| Tài khoản quản trị (realm role `platform_admin`, OTP) | thêm `x-hasura-role: platform_admin` | `platform_admin` | như `user`, cộng bảng phân quyền và ghi dữ liệu chủ |

- Token **không** mang claim Hasura ([ADR #32](#adr-32)): luật CASL dựng từ query `core_v_permission_grant` (chỉ trả quyền của chính người gọi), không đọc claim trong token như mục 2.3 của thiết kế giao diện.
- Một tài khoản có thể vào nhiều tenant ([ADR #30](#adr-30)); `my_tenants` trả `person_id` của người dùng trong từng tenant. Mọi cột người (`requester_id`, `assignee_id`, `recipient_id`...) so với `person_id` này.
- Subscription: cùng header, qua websocket `/v1/graphql`; hạn kết nối theo hạn token.
- Ứng dụng Refine (`apps/web/web`) đọc địa chỉ từ biến Vite (`.env.example`): `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT`, `VITE_HASURA_URL`; mặc định trỏ vào stack `docker compose` trên máy dev. Tenant đã chọn lưu ở `localStorage["bamboo.tenant"]` và gửi kèm mọi request (cả websocket).

## 2. Ánh xạ màn hình

| Màn hình (07-thiet-ke-UI) | Backend hiện có |
|---|---|
| `/p/documents` danh sách, chi tiết | `proc_purchase_request` (+ `purchase_request_items`, `approval_steps`, `approval_history`, `comments`, `partner`, `requester`, `org_unit`). Chỉ trả dòng người gọi được xem (`can_read`) |
| `/p/documents/create`, `/edit/:id` | `insert_proc_purchase_request_one` (lồng `purchase_request_items`), `update_…_by_pk`, dòng hàng `insert/update/delete_proc_purchase_request_item`; gửi duyệt bằng Action `submit_purchase_request`; hủy bằng `cancel_purchase_request` |
| `/p/inbox` (Action `my-tasks` trong thiết kế) | `wf_v_inbox` (việc của mình và việc nhận qua ủy quyền, `via_delegation`), subscription được |
| `/p/inbox/:taskId` (`complete-task`) | Action `act_on_task(task_id, decision: APPROVE/REJECT/RETURN, note)` |
| `/p/process/:documentId` (`process-state`) | Action `process_state(request_id)`: `bpmn_xml`, `active_activity_ids`, `completed_activity_ids` cho bpmn-js |
| Thông báo ở header | `collab_notification` (của mình), subscription; `collab_mark_notifications_read(args: {ids})` (bỏ `ids`: tất cả) |
| Bình luận trên chứng từ | `insert_collab_comment_one` (`entity_type: "proc.purchase_request"`, `entity_id`, `body`, `parent_id`, `mentions`); sửa `body`, xóa mềm bằng cách đặt `deleted_at` |
| Tệp đính kèm (`file-upload` mục 6.3 thiết kế giao diện) | `get_upload_url` → PUT tệp lên `upload_url` (header `Content-Type` = `content_type` trả về) → `confirm_upload` (trả `status`: `CLEAN`, `REJECTED`, `INFECTED` kèm `scan_result`); danh sách: quan hệ `attachments` của đề nghị; tải về: query `get_download_url`; xóa: `delete_attachment` |
| `/admin/audit-logs` (`audit_events` trong thiết kế) | `audit_log` (+ `actor`), chỉ người có quyền `audit.read` |
| `/d/ledger` (`verify-ledger`) | Action `verify_audit_chain`: `ok`, `checked`, `head_seq`, `head_hash`, `problems` ([ADR #33](#adr-33)) |
| Danh mục chọn trong form | `mdm_partner`, `mdm_item`, `core_catalog_item(where: {catalog: {_eq: "ITEM_CATEGORY"}})`, tư cách lập: `core_assignment` của mình |
| `/i/search`, `/i/chat`, `/i/ocr`, `/d/*` | Chưa có |

## 3. Lưu ý khi dùng

- **Tổng tiền sau khi tạo kèm dòng hàng:** phản hồi của `insert_proc_purchase_request_one` lồng `purchase_request_items` chụp dòng cha trước khi chèn dòng hàng nên `total_amount` còn là 0; đọc lại bằng `proc_purchase_request_by_pk` (Refine tự refetch sau create).
- Có dòng hàng thì `total_amount` luôn bằng tổng các dòng; sửa tay bị ghi đè. `doc_no` do CSDL sinh, không gửi lên.
- Đề nghị đang chờ duyệt hoặc đã xong thì update/delete trả về `null`/`affected_rows: 0` (không khớp quyền) hoặc lỗi "không sửa được dòng hàng".
- **Lỗi nghiệp vụ** trả về `errors[0].message` tiếng Việt, dùng thẳng được trên giao diện; `extensions.code`: `not-found`, `forbidden`, `note-required`, `rejected`, `unauthorized`, `constraint-violation`.
- Trạng thái đề nghị: `DRAFT`, `PENDING`, `RETURNED`, `APPROVED`, `REJECTED`, `CANCELLED`. Loại thông báo: `TASK_ASSIGNED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_RETURNED`, `REQUEST_CANCELLED`, `COMMENT`, `MENTION`.

## 4. Ví dụ

```graphql
# Hộp việc, tự cập nhật
subscription Inbox {
  wf_v_inbox(order_by: {created_at: desc}) {
    task_id via_delegation escalated escalation_reason created_at
    purchase_request { id doc_no title total_amount requester { full_name } }
  }
}

# Tạo đề nghị kèm dòng hàng
mutation CreatePR($pos: uuid!) {
  insert_proc_purchase_request_one(object: {
    requester_position_id: $pos, title: "Linh kiện thay thế", partner_id: null,
    purchase_request_items: {data: [{item_id: "…", quantity: 1000, unit_price: 12000}]}
  }) { id doc_no }
}

# Quyền của tôi (dựng CASL)
query MyPermissions { core_v_permission_grant { permission_code scope anchor_unit_id valid_period } }
```
