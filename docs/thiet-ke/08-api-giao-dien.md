<!--
  Bamboo - DX-OS Open-Core
  @version 0.5.1
  @author CTUBamboo
  @copyright Copyright 2026 Bamboo
  @license Apache-2.0
  @see https://github.com/CTUBamboo/Bamboo, Bamboo project

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

# API của nền tảng (Hasura GraphQL)

Tầng 1 không có giao diện người dùng cuối; mọi ứng dụng Tầng 2 (kể cả giao diện Refine trong `apps/web`) gọi nền tảng
qua một endpoint GraphQL duy nhất: `/graphql` trên cổng API APISIX ([ADR #34](#adr-34)). Ngoài GraphQL chỉ có hai đường HTTP
cho máy gọi máy: nạp dữ liệu theo lô `/ingest/*` và webhook khởi chạy quy trình tự động `/hooks/*`
([Dịch vụ nền tảng mục 18–19](06-dich-vu-nen-tang.md)), cùng API công khai `/setup/*` của trang khởi tạo công ty lần đầu
(mục 23).

Schema đầy đủ: introspection qua `/graphql` (sinh type bằng graphql-codegen); khi gỡ lỗi có thể bật Hasura Console
(`HASURA_ENABLE_CONSOLE=true`, `http://localhost:8081/console`, chỉ trên máy chủ). Trang này mô tả cách kết nối, các nhóm API và lưu ý khi dùng.

## 1. Kết nối và phiên

| Bước | Header | Role Hasura | Gọi được |
|---|---|---|---|
| Đăng nhập Keycloak (client `bms-web`, PKCE) | `Authorization: Bearer <access token>` | `account` | chỉ query `my_tenants` |
| Chọn tenant | thêm `x-bamboo-tenant: <tenant_id>` | `user` | toàn bộ API dưới đây |
| Tài khoản quản trị (realm role `platform_admin`, OTP) | thêm `x-hasura-role: platform_admin` | `platform_admin` | như `user`, cộng bảng phân quyền và ghi dữ liệu chủ |

- Token **không** mang claim Hasura ([ADR #32](#adr-32)): giao diện dựng luật CASL từ query `core_v_permission_grant` (chỉ trả quyền của chính người gọi).
- Một tài khoản có thể vào nhiều tenant ([ADR #30](#adr-30)); `my_tenants` trả `person_id` của người dùng trong từng tenant. Mọi cột người (`requester_id`, `assignee_id`, `recipient_id`...) so với `person_id` này.
- Subscription: websocket (giao thức `graphql-ws`) cùng địa chỉ `/graphql`, header gửi trong `connectionParams`; cổng API chuyển tới `/v1/graphql` của Hasura; hạn kết nối theo hạn token.
- Ứng dụng Refine (`apps/web`) mặc định gọi Keycloak (`/realms`) và Hasura (`/graphql`) cùng origin với trang; `pnpm dev` dùng `.env.development` trỏ vào cổng `http://localhost:8000`. Ghi đè bằng `/config.js` lúc chạy hoặc biến `VITE_*` lúc build khi backend ở địa chỉ khác.
- Cổng API trả **401** khi request `/graphql` không có token hợp lệ (trước khi tới Hasura), **429** khi vượt giới hạn tần suất, **403** khi WAF chặn; mọi phản hồi có `X-Request-Id` để đối chiếu log. Tenant đã chọn lưu ở `localStorage["bamboo.tenant"]` và gửi kèm mọi request (cả websocket).

## 2. Ánh xạ màn hình chính

Ví dụ cách giao diện trong `apps/web/src/pages` dùng API cho luồng mua sắm, tiếp nhận nhân sự và đơn hàng nội bộ. Danh mục đầy đủ các Action ở mục 3.

| Màn hình | API |
|---|---|
| `/p/documents` danh sách, chi tiết | `proc_purchase_request` (+ `purchase_request_items`, `approval_steps`, `approval_history`, `comments`, `partner`, `requester`, `org_unit`). Chỉ trả dòng người gọi được xem (`can_read`) |
| `/p/documents/create`, `/edit/:id` | `insert_proc_purchase_request_one` (lồng `purchase_request_items`), `update_…_by_pk`, dòng hàng `insert/update/delete_proc_purchase_request_item`; gửi duyệt bằng Action `submit_purchase_request`; hủy bằng `cancel_purchase_request` |
| `/p/inbox` (Action `my-tasks` trong thiết kế) | `wf_v_inbox` (việc của mình và việc nhận qua ủy quyền, `via_delegation`), subscription được |
| `/p/inbox/:taskId` (`complete-task`) | Action `act_on_task(task_id, decision: APPROVE/REJECT/RETURN, note)` |
| `/p/process/:id` (`process-state`, nút **Sơ đồ quy trình** trên chi tiết đề nghị) | Action `process_state(request_id)`: `bpmn_xml`, `active_activity_ids`, `completed_activity_ids` cho trình xem sơ đồ; `source` = `flowable` hoặc `database` (Flowable chưa đồng bộ thì suy ra từ trạng thái chứng từ). Giao diện tải lớp BPMN (`apps/web/src/bpmn`, [ADR #81](#adr-81)) lười |
| Thông báo ở header | `collab_notification` (của mình), subscription; `collab_mark_notifications_read(args: {ids})` (bỏ `ids`: tất cả) |
| Bình luận trên chứng từ | `insert_collab_comment_one` (`entity_type: "proc.purchase_request"`, `entity_id`, `body`, `parent_id`, `mentions`); sửa `body`, xóa mềm bằng cách đặt `deleted_at` |
| Tệp đính kèm | `get_upload_url` → PUT tệp lên `upload_url` (header `Content-Type` = `content_type` trả về) → `confirm_upload` (trả `status`: `CLEAN`, `REJECTED`, `INFECTED` kèm `scan_result`); danh sách: quan hệ `attachments` của đề nghị; tải về: query `get_download_url`; xóa: `delete_attachment` |
| `/admin/audit-logs` (`audit_events` trong thiết kế) | `audit_log` (+ `actor`), chỉ người có quyền `audit.read`; không có `old_data`, `new_data`: dữ liệu trước/sau đã che lấy bằng Action `audit_log_detail(log_ids: [Int!]!)` → `old_data`, `new_data` (jsonb), `masked` (loại dữ liệu đã che) ([ADR #43](#adr-43)) |
| Ô trao đổi: kiểm tra trước khi gửi | Query `check_pii(text)` → `masked_text`, `entities` { `entity` `label` `start` `end` } |
| `/d/ledger` (`verify-ledger`) | Action `verify_audit_chain`: `ok`, `checked`, `head_seq`, `head_hash`, `problems` ([ADR #33](#adr-33)) |
| Danh mục chọn trong form | `mdm_partner`, `mdm_item`, `core_catalog_item(where: {catalog: {_eq: "ITEM_CATEGORY"}})`, tư cách lập: `core_assignment` của mình |
| `/i/search?q=&kind=` (tìm kiếm toàn văn) | Action `search_documents(query, kind, limit, offset)` → `[SearchHit]`: `kind` (`purchase_request`/`attachment`), `entity_id`, `attachment_id`, `file_name`, `matched_field`, `snippet` (HTML an toàn, chữ khớp trong `<mark>`), quan hệ `purchase_request`, `attachment`. Gõ không dấu được; chỉ trả chứng từ người gọi xem được ([ADR #36](#adr-36)). Kết quả có độ trễ đồng bộ vài giây sau khi sửa |
| Nút **In phiếu** trên chi tiết đề nghị | Query `get_purchase_request_pdf(request_id)` → `url` (link tải PDF có chữ ký 5 phút), `file_name` (`<số chứng từ>.pdf`), `check_code`, `status`, `cached` ([ADR #37](#adr-37)). Link trả `Content-Disposition: attachment`: điều hướng tới `url` là tải tệp về, trang hiện tại giữ nguyên (mở tab mới sẽ để lại tab trống) |
| `/h/onboarding` danh sách, chi tiết (tiếp nhận nhân sự, [ADR #41](#adr-41)) | `hr_onboarding_request` (+ `target_position`, `requester`, `person`, `approval_steps`, `approval_history`, `comments`, `attachments`), chỉ dòng người gọi xem được (`can_read`). Dữ liệu nhạy cảm chỉ có bản che `national_id_masked`, `bank_account_masked`, `address_masked`; cột bản mã không mở. `can_read_private`: người gọi có được xem bản đầy đủ không |
| `/h/onboarding/create`, `/edit/:id` | `insert_hr_onboarding_request_one`, `update_…_by_pk` (người lập, khi nháp hoặc bị trả về); CCCD, số tài khoản, địa chỉ ghi bằng Action `save_onboarding_private(request_id, national_id, bank_account, bank_name, address)` (bỏ trường: giữ nguyên; chuỗi rỗng: xóa, trừ CCCD); gửi duyệt `submit_onboarding_request`; hủy `cancel_onboarding_request(request_id, reason)`. Vị trí gợi ý: `core_position` + `assignments` (còn trống từ ngày vào làm) trong phạm vi `core_v_permission_grant` có `hr.onboarding.create` |
| Nút **Xem đầy đủ** trên hồ sơ tiếp nhận | Mutation `reveal_onboarding_private(request_id)` → `national_id`, `bank_account`, `address`, `username`, `initial_password` (mật khẩu tạm sau khi tạo tài khoản). Cần `hr.onboarding.private.read`; mỗi lần gọi ghi một dòng nhật ký kiểm toán |
| Trạng thái tài khoản nhân viên mới | Cột `account_status` (`NONE`, `PENDING`, `CREATED`, `FAILED`), `account_error`; tạo lại bằng `retry_onboarding_account(request_id, username)` |
| `/p/ic-orders` danh sách, chi tiết (đơn hàng nội bộ, [ADR #42](#adr-42)) | `ic_ic_order` (+ `seller_unit`, `buyer_unit`, `created_by_person`, `ic_order_items` { `lot` }, `purchase_requests`, `purchase_orders`, `comments`), computed field `can_confirm`; lọc "Chờ tôi xác nhận": `where: {can_confirm: {_eq: true}}`. Lô chọn được: `mfg_lot(where: {item_id: {_in: …}, status: {_eq: "RELEASED"}, org_unit: {path: {_descendant: <path công ty bán>}}})` |
| Nút **Xác nhận và xuất lô**, **Từ chối**, **Hủy đơn** | Mutation `confirm_ic_order(order_id, lots: [{line_id, lot_id}])` → `status`, `purchase_order_id`; `reject_ic_order(order_id, reason)`, `cancel_ic_order(order_id, reason)` |
| Đơn hàng nội bộ trên chi tiết đề nghị | `proc_purchase_request.ic_order` { `doc_no` `status` }; nhà cung cấp nội bộ: `partner.internal_unit_id` |
| `/h/chat` Tin nhắn ([ADR #65](#adr-65)) | subscription `chat_conversation` (computed field `unread`, `display_name`; `members` của mình: `muted`, `role`), subscription `chat_message(where: {conversation_id}, order_by: {id: desc}, limit: 100)` (+ `sender`, `attachment`), `chat_member` (`last_read_id` cho "đã xem"); gửi `insert_chat_message_one` (`conversation_id`, `body`, `reply_to_id`, `attachment_id`, `mentions` dạng `{uuid,…}`), sửa/thu hồi `update_chat_message_by_pk` (`body` / `deleted_at`), đã đọc, tắt thông báo `update_chat_member_by_pk`; tệp: `get_upload_url(entity_type: "chat.conversation")` |
| `/h/calendar` Lịch công tác ([ADR #65](#adr-65)) | `calendar_events(from, to, view: all/mine/unit, unit_id)` → `events` (mỗi lần diễn ra một mục; `source: project` là công việc dự án); `calendar_save(event: jsonb)` → `id`, `invited`, `conflicts`; `calendar_cancel`, `calendar_respond(id, response)`; tín hiệu `live_event` chủ đề `calendar` |
| `/p/projects` Dự án và kế hoạch ([ADR #66](#adr-66)) | Danh sách: `pm_project` (+ `manager`, `org_unit`; computed field `stats` { `actual_pct` `planned_pct` `spi` `late_tasks` `total_tasks` `done_tasks` }, `can_manage`; [ADR #67](#adr-67)). Chi tiết: `pm_project_detail(id)` → `project`, `members`, `tasks` (đã tính `wbs`, `level`, `has_children`, `slack_days`, `critical`, `late`, `slip_days`), `dependencies`, `stats` (`actual_pct`, `planned_pct`, `spi`, `late_tasks`, `suggested_health`), `reports`, `can_manage`, `my_role`, `warnings`. Ghi: `pm_project_save(project: jsonb)`, `pm_members_set`, `pm_task_save(task: jsonb)` → `shifted`, `pm_task_delete`, `pm_task_reorder(id, direction)`, `pm_baseline_set`, `pm_report_create(report: jsonb)`; văn bản: `pm_plan_pdf`, `pm_report_pdf`; tín hiệu `live_event` chủ đề `project` |
| `/d/api` Cổng dịch vụ API ([ADR #64](#adr-64)) | `api_catalog` (phạm vi, endpoint); quản trị viên: `api_api_key` (+ `created_by_person`, `usages`; computed field `last_used_at`, `last_ip` đọc từ `api.usage`, [ADR #67](#adr-67)), `api_key_create`, `api_key_revoke`. Hệ thống ngoài gọi REST `/api/v1/*` với `Authorization: Bearer bak_…`, đặc tả `/api/v1/openapi.json` |
| `/d/lineage` Phả hệ dữ liệu | `meta_lineage_node(where: {origin})` (+ `quality_checks`), `meta_lineage_edge`, `meta_pipeline_run`; nút **Thu thập và kiểm tra**: `lineage_refresh` |
| `/i/bi` Phân tích BI ([ADR #63](#adr-63)) | `semantic_catalog` → `sources` { `name` `label` `dimensions` `measures` }, `grains`; `semantic_query(metrics: [String!], dimensions, time_grain, from, to, filters, limit)` → `columns`, `rows`, `measures`, `sql`. Biểu đồ đã lưu: `kpi_chart` (của mình hoặc `shared`, computed field `is_mine`), `insert_kpi_chart_one` (`name`, `chart_type`, `spec`, `shared`), `update_kpi_chart_by_pk`, `delete_kpi_chart_by_pk` (chỉ của mình) |
| `/i/assistant` Trợ lý RAG | `ai_ask(agent_id, question, kb_document_id)` rồi subscription `core_ai_question_by_pk`: `answer` (số `[n]` là số văn bản), `citations` mỗi văn bản một mục { `n` `title` `doc_no` `kb_document_id` `file_name` `sections` }, `reused_from` khi câu trả lời được dùng lại |

## 3. Danh mục Hasura Action

Nghiệp vụ nhiều bước đi qua 137 Hasura Action (dịch vụ `actions`, khai báo trong `infra/platform/hasura/metadata.json`). Mỗi Action tự kiểm quyền theo người gọi và tenant trong phiên; bảng và view (80) đọc trực tiếp qua GraphQL với quyền theo dòng.

| Nhóm | Query | Mutation |
|---|---|---|
| Phê duyệt, mua sắm | `process_state`, `get_purchase_request_pdf`, `proposed_partners` | `submit_purchase_request`, `act_on_task`, `cancel_purchase_request`, `adopt_proposed_partner` |
| Đơn hàng nội bộ | – | `confirm_ic_order`, `reject_ic_order`, `cancel_ic_order` |
| Nhân sự | `transfer_target_units`, `transfer_tenants`, `personnel_decisions`, `personnel_decision_context`, `get_personnel_decision_pdf` | `submit_onboarding_request`, `cancel_onboarding_request`, `save_onboarding_private`, `reveal_onboarding_private`, `retry_onboarding_account`, `create_person_accounts`, `create_transfer_request`, `submit_transfer_request`, `cancel_transfer_request`, `choose_transfer_position`, `create_transfer_out`, `submit_transfer_out`, `cancel_transfer_out`, `choose_transfer_in_position`, `issue_personnel_decision` |
| Tệp, Ổ đĩa, tìm kiếm | `get_download_url`, `drive_usage`, `search_documents` | `get_upload_url`, `confirm_upload`, `delete_attachment` |
| Thư viện tri thức | `kb_library` | `submit_kb_document`, `cancel_kb_document`, `retire_kb_document`, `kb_reindex` |
| Quản trị tổ chức, dữ liệu chủ | `my_tenants`, `admin_import_template` | `admin_save`, `admin_close`, `admin_import`, `delete_person` |
| Thiết kế, giám sát, chạy tự động quy trình | `process_models`, `process_model_get`, `process_model_validate`, `process_version_get` | `process_model_save`, `process_model_publish`, `process_model_delete`, `process_from_document`, `process_regulation_draft`, `process_sandbox_run`, `process_change_request_create`, `process_change_request_resolve`, `process_automation_enable`, `process_automation_disable`, `process_automation_start`, `process_automation_webhook`, `process_automation_events` |
| Kiểm toán, sổ cái, dữ liệu cá nhân | `audit_log_detail`, `verify_audit_chain`, `audit_anchors`, `audit_anchor_verify`, `ledger_overview`, `ledger_archive`, `check_pii` | `audit_anchor_now`, `ledger_verify`, `ledger_open_archive` |
| Thông báo, hàng đợi tin nhắn | `notification_prefs`, `my_deliveries`, `queue_overview`, `queue_verify` | `save_notification_pref`, `delete_notification_pref`, `send_test_notification`, `queue_retry` |
| Dữ liệu số: điều hành, Lakehouse, KPI, bản sao số | `ops_dashboard`, `lakehouse_datasets`, `lakehouse_preview`, `semantic_catalog`, `semantic_query`, `kpi_snapshots`, `get_kpi_report_pdf` | `iot_acknowledge` |
| Nhắn tin, lịch công tác ([ADR #65](#adr-65)) | `calendar_events`; subscription `chat_conversation`, `chat_message`, `chat_member` | `chat_open_direct`, `chat_create_group`, `chat_update_group`, `chat_leave`, `calendar_save`, `calendar_cancel`, `calendar_respond`; `insert_chat_message_one`, `update_chat_message_by_pk`, `update_chat_member_by_pk` |
| Quản lý dự án ([ADR #66](#adr-66)) | `pm_project_detail`, `pm_plan_pdf`, `pm_report_pdf` | `pm_project_save`, `pm_members_set`, `pm_task_save`, `pm_task_delete`, `pm_task_reorder`, `pm_baseline_set`, `pm_report_create` |
| Thời gian thực, phả hệ, cổng dịch vụ API ([ADR #64](#adr-64)) | `lineage_graph`, `api_catalog`; subscription `live_event`, `live_v_online` | `lineage_refresh`, `api_key_create`, `api_key_revoke`; `insert_live_presence_one` |
| Trí tuệ số | `ai_assistants`, `ai_models`, `ai_agent_stats`, `ocr_document` | `ai_ask`, `ai_agent_register`, `ai_agent_update`, `ai_agent_unregister`, `ocr_retry` |
| Vận hành | `obs_logs`, `backup_runs` | – |
| Mô-đun chức năng ([ADR #56](#adr-56)) | `modules` | `module_enable`, `module_disable`, `module_install`, `module_uninstall` |
| Thông tin pháp lý, chủ sở hữu ([ADR #57](#adr-57)) | `legal_status` | `legal_update`, `legal_application`, `legal_verify`, `transfer_ownership`, `create_subsidiary` |
| Mô-đun ngoài ([ADR #58](#adr-58)) | – | `ext_register`, `ext_rotate_key`, `ext_launch` |

## 4. Lưu ý khi dùng

- **Tổng tiền sau khi tạo kèm dòng hàng:** phản hồi của `insert_proc_purchase_request_one` lồng `purchase_request_items` chụp dòng cha trước khi chèn dòng hàng nên `total_amount` còn là 0; đọc lại bằng `proc_purchase_request_by_pk` (Refine tự refetch sau create).
- Có dòng hàng thì `total_amount` luôn bằng tổng các dòng; sửa tay bị ghi đè. `doc_no` do CSDL sinh, không gửi lên.
- Đề nghị đang chờ duyệt hoặc đã xong thì update/delete trả về `null`/`affected_rows: 0` (không khớp quyền) hoặc lỗi "không sửa được dòng hàng".
- **Mô-đun chưa bật:** Action của mô-đun trả `module-disabled` (403); bảng thuộc riêng mô-đun trả mảng rỗng, ghi bị từ chối. Đọc `modules` để biết mô-đun nào đang bật ([ADR #56](#adr-56)).
- **Lỗi nghiệp vụ** trả về `errors[0].message` tiếng Việt, dùng thẳng được trên giao diện; `extensions.code`: `not-found`, `forbidden`, `note-required`, `rejected`, `unauthorized`, `constraint-violation`, `query-required`, `search-unavailable`, `pdf-unavailable`, `pii-unavailable` (két mã hóa không truy cập được).
- **Hộp việc nhiều loại chứng từ:** `wf_v_inbox` có `entity_type`; quan hệ `purchase_request` hoặc `onboarding_request` (cái còn lại là `null`). Thông báo cũng có `entity_type` để mở đúng trang. `act_on_task` trả `request_id` là id của chứng từ, loại nào cũng vậy.
- **Tiếp nhận nhân sự:** duyệt xong CSDL tạo người và bổ nhiệm ngay trong giao dịch duyệt; tài khoản Keycloak tạo ở nền vài giây sau (`account_status` từ `PENDING` sang `CREATED`), nên tải lại hồ sơ cho tới khi có kết quả.
- Trạng thái đề nghị (cả mua sắm và tiếp nhận nhân sự): `DRAFT`, `PENDING`, `RETURNED`, `APPROVED`, `REJECTED`, `CANCELLED`. Loại thông báo: `TASK_ASSIGNED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_RETURNED`, `REQUEST_CANCELLED`, `COMMENT`, `MENTION`.

## 5. Ví dụ

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

# Tìm kiếm toàn văn (đề nghị và nội dung tệp)
query Search($q: String!) {
  search_documents(query: $q, limit: 20) {
    kind snippet matched_field file_name attachment_id
    purchase_request { id doc_no title status }
  }
}

# Quyền của tôi (dựng CASL)
query MyPermissions { core_v_permission_grant { permission_code scope anchor_unit_id valid_period } }
```
