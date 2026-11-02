-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Xóa đề nghị mua sắm do người dùng lập qua ứng dụng (không phải dữ liệu seed) cùng mọi thứ đi kèm.
-- Dữ liệu seed được lập khi CSDL không có phiên người dùng nên dòng INSERT trong audit.log không có actor_id;
-- đề nghị lập qua giao diện thì có. Nhật ký kiểm toán chỉ cho ghi thêm nên được giữ nguyên (trigger sẽ ghi thêm
-- các dòng DELETE, chuỗi băm vẫn hợp lệ). Chạy bằng tools/demo_cleanup.sh, không chạy tay.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE test_pr ON COMMIT DROP AS
SELECT r.id, r.tenant_id, r.ic_order_id, r.title, r.doc_no, r.status
FROM proc.purchase_request r
WHERE EXISTS (SELECT 1 FROM audit.log l
              WHERE l.table_name = 'proc.purchase_request' AND l.row_id = r.id::text
                AND l.op = 'INSERT' AND l.actor_id IS NOT NULL);

CREATE TEMP TABLE test_ic ON COMMIT DROP AS
SELECT DISTINCT ic_order_id AS id FROM test_pr WHERE ic_order_id IS NOT NULL
UNION
SELECT o.ic_order_id FROM proc.purchase_order o JOIN test_pr t ON t.id = o.request_id;

\echo === Đề nghị sẽ xóa ===
SELECT t.code AS tenant, p.doc_no, p.status, p.title
FROM test_pr p JOIN core.tenant t ON t.id = p.tenant_id ORDER BY t.code, p.doc_no;

-- Lệnh nội bộ có thể gộp nhiều đề nghị: không xóa nếu còn đề nghị của dữ liệu seed trỏ vào
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM test_ic i JOIN proc.purchase_request r ON r.ic_order_id = i.id
               WHERE r.id NOT IN (SELECT id FROM test_pr)) THEN
        RAISE EXCEPTION 'Có lệnh nội bộ còn được đề nghị khác (dữ liệu seed) dùng chung, dừng lại';
    END IF;
END $$;

CREATE TEMP TABLE test_step ON COMMIT DROP AS
SELECT s.id FROM wf.approval_step s WHERE s.entity_type = 'proc.purchase_request' AND s.entity_id IN (SELECT id FROM test_pr);

-- Các lệnh DELETE theo thứ tự khóa ngoại; \gset không dùng nên đếm bằng CTE
\echo === Số dòng bị xóa ===
WITH
 d1 AS (DELETE FROM proc.purchase_order WHERE request_id IN (SELECT id FROM test_pr) RETURNING 1),
 d2 AS (DELETE FROM wf.approval_history WHERE entity_type = 'proc.purchase_request' AND entity_id IN (SELECT id FROM test_pr) RETURNING 1),
 d3 AS (DELETE FROM wf.task WHERE step_id IN (SELECT id FROM test_step) RETURNING 1)
SELECT (SELECT count(*) FROM d1) AS don_hang, (SELECT count(*) FROM d2) AS lich_su_duyet, (SELECT count(*) FROM d3) AS viec;

DELETE FROM wf.approval_step WHERE id IN (SELECT id FROM test_step);
DO $$
DECLARE v_id text;
BEGIN
    FOR v_id IN SELECT process_instance_id FROM wf.flow_sync
                WHERE entity_type = 'proc.purchase_request' AND entity_id IN (SELECT id FROM test_pr)
                  AND process_instance_id IS NOT NULL LOOP
        RAISE NOTICE 'FLOWABLE %', v_id;
    END LOOP;
END $$;
DELETE FROM wf.flow_sync WHERE entity_type = 'proc.purchase_request' AND entity_id IN (SELECT id FROM test_pr);
DELETE FROM collab.comment WHERE entity_type = 'proc.purchase_request' AND entity_id IN (SELECT id FROM test_pr);
DELETE FROM collab.notification WHERE entity_type = 'proc.purchase_request' AND entity_id IN (SELECT id FROM test_pr);
DELETE FROM collab.notification WHERE entity_type = 'ic.ic_order' AND entity_id IN (SELECT id FROM test_ic);
DELETE FROM core.attachment WHERE entity_type = 'proc.purchase_request' AND entity_id IN (SELECT id FROM test_pr);
DELETE FROM proc.purchase_request WHERE id IN (SELECT id FROM test_pr);
DELETE FROM ic.ic_order_item WHERE order_id IN (SELECT id FROM test_ic);
DELETE FROM ic.ic_order WHERE id IN (SELECT id FROM test_ic);
-- Số chứng từ lập tiếp theo quay về sau số lớn nhất còn lại (đề nghị, đơn hàng, lệnh nội bộ)
UPDATE core.doc_sequence s SET last_no = d.mx
FROM (
    SELECT tenant_id, split_part(doc_no, '-', 1) AS prefix, split_part(doc_no, '-', 2)::int AS year,
           max(split_part(doc_no, '-', 3)::int) AS mx
    FROM (SELECT tenant_id, doc_no FROM proc.purchase_request
          UNION ALL SELECT tenant_id, doc_no FROM proc.purchase_order
          UNION ALL SELECT tenant_id, doc_no FROM ic.ic_order) x
    WHERE doc_no ~ '^[A-Z]+-\d+-\d+$'
    GROUP BY 1, 2, 3
) d
WHERE s.tenant_id = d.tenant_id AND s.prefix = d.prefix AND s.year = d.year AND s.prefix IN ('PR', 'PO', 'IC')
  AND s.last_no > d.mx;
SELECT kpi.refresh();

\echo === Còn lại ===
SELECT (SELECT count(*) FROM proc.purchase_request) AS de_nghi,
       (SELECT count(*) FROM ic.ic_order) AS lenh_noi_bo,
       (SELECT count(*) FROM wf.task WHERE status = 'OPEN') AS viec_dang_cho;

:finish;
