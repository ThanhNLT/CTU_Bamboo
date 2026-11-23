-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

SELECT test.fixture();

INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'DE_XUAT_TL', 'Đề xuất tài liệu')
RETURNING test.put('R_TL', id);
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
VALUES (test.id('TDX'), test.id('R_TL'), 'kb.document.create');
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
VALUES (test.id('TDX'), test.id('R_TL'), test.id('P_NV_MH_DT'), 'UNIT');
INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, approver_unit_type_id, valid_period)
VALUES (test.id('TDX'), 'KB_DOCUMENT', 0, 1, NULL, tstzrange(now() - interval '1 year', NULL));

CREATE FUNCTION pg_temp.doc(p_key text, p_scope text, p_supersedes text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO collab.kb_document (tenant_id, title, category, scope, requester_id, requester_position_id,
                                    supersedes_id)
    VALUES (test.id('TDX'), 'Quy chế ' || p_key, 'regulation', p_scope, test.id('c'), test.id('P_NV_MH_DT'),
            CASE WHEN p_supersedes IS NULL THEN NULL ELSE test.id(p_supersedes) END)
    RETURNING test.put(p_key, id)
$$;

CREATE FUNCTION pg_temp.attach(p_key text) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO core.attachment (tenant_id, entity_type, entity_id, file_name, content_type, size_bytes, storage_key,
                                 uploaded_by, status, sha256, scan_engines, scanned_at)
    VALUES (test.id('TDX'), 'collab.kb_document', test.id(p_key), p_key || '.pdf', 'application/pdf', 10,
            'k-' || p_key, test.id('c'), 'CLEAN', repeat('a', 64), ARRAY['test'], now())
$$;

CREATE FUNCTION pg_temp.st(p_key text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT status FROM collab.kb_document WHERE id = test.id(p_key) $$;

SELECT pg_temp.doc('d1', 'company');
SELECT test.ok((SELECT doc_no FROM collab.kb_document WHERE id = test.id('d1')) ~ '^TL-\d{4}-\d{6}$', 'Số TL-…');
SELECT test.eq((SELECT org_unit_id FROM collab.kb_document WHERE id = test.id('d1')), test.id('DT_MH'),
               'Đơn vị ban hành lấy từ tư cách lập');
SELECT test.throws($$SELECT collab.submit_kb_document(test.id('d1'), test.id('c'))$$,
                   '%Đính kèm tệp%', 'Phải có tệp đã kiểm dịch');
SELECT pg_temp.attach('d1');
SELECT test.ok(NOT wf.entity_can_read('collab.kb_document', test.id('d1'), test.id('a')),
               'Bản nháp: người ngoài không đọc');

SELECT collab.submit_kb_document(test.id('d1'), test.id('c'));
SELECT test.eq(pg_temp.st('d1'), 'PENDING', 'Gửi duyệt');
SELECT test.eq(test.assignee('d1'), 'tp_mh_dt', 'Trưởng đơn vị duyệt');
SELECT test.ok(wf.entity_can_read('collab.kb_document', test.id('d1'), test.id('tp_mh_dt')), 'Người duyệt đọc được');
SELECT test.approve('d1', 'tp_mh_dt');
SELECT test.eq(pg_temp.st('d1'), 'APPROVED', 'Duyệt xong là xuất bản');
SELECT test.throws($$SELECT pg_temp.attach('d1')$$, '%Chỉ người lập thêm tệp%',
                   'Tài liệu đã xuất bản không nhận thêm tệp (tệp sẽ vào chỉ mục)');
SELECT test.ok((SELECT published_at FROM collab.kb_document WHERE id = test.id('d1')) IS NOT NULL, 'Có thời điểm xuất bản');

SELECT test.ok(wf.entity_can_read('collab.kb_document', test.id('d1'), test.id('gd_dt')), 'Cùng công ty đọc được');
SELECT test.ok(NOT wf.entity_can_read('collab.kb_document', test.id('d1'), test.id('a')), 'Công ty khác không đọc');
SELECT test.ok(EXISTS (SELECT 1 FROM search.pending WHERE entity_type = 'collab.kb_document'
                                                       AND entity_id = test.id('d1')), 'Vào hàng đợi chỉ mục');
SELECT test.ok(search.kb_document_doc(test.id('d1')) ->> 'doc_no' LIKE 'TL-%', 'Tài liệu hiệu lực có nội dung chỉ mục');

SELECT pg_temp.doc('d2', 'group', 'd1');
SELECT test.eq((SELECT version FROM collab.kb_document WHERE id = test.id('d2')), 2, 'Bản thay thế là v2');
SELECT pg_temp.attach('d2');
SELECT collab.submit_kb_document(test.id('d2'), test.id('c'));
SELECT test.approve('d2', 'tp_mh_dt');
SELECT test.eq(pg_temp.st('d1'), 'RETIRED', 'Bản cũ ngừng hiệu lực');
SELECT test.ok(search.kb_document_doc(test.id('d1')) IS NULL, 'Bản cũ ra khỏi chỉ mục');
SELECT test.ok(wf.entity_can_read('collab.kb_document', test.id('d2'), test.id('a')), 'Phạm vi tập đoàn: ai cũng đọc');
SELECT test.ok(NOT wf.entity_can_read('collab.kb_document', test.id('d2'), (SELECT id FROM core.person
                                       WHERE tenant_id = test.id('BVX') LIMIT 1)), 'Tenant khác không đọc');

SELECT pg_temp.doc('d3', 'company');
SELECT collab.cancel_kb_document(test.id('d3'), test.id('c'), 'Không cần nữa');
SELECT test.eq(pg_temp.st('d3'), 'CANCELLED', 'Người lập hủy được');
SELECT test.throws($$SELECT collab.retire_kb_document(test.id('d2'), test.id('c'), 'x')$$,
                   '%kb.document.manage%', 'Ngừng hiệu lực cần quyền quản lý');

SELECT search.mark_all();
SELECT test.ok(NOT EXISTS (SELECT 1 FROM search.pending p JOIN core.attachment a ON a.id = p.entity_id
                           WHERE p.entity_type = 'core.attachment' AND a.entity_type = 'hr.onboarding_request'),
               'mark_all bỏ qua tệp hồ sơ nhân sự');
