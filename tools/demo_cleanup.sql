-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM test_ic i JOIN proc.purchase_request r ON r.ic_order_id = i.id
               WHERE r.id NOT IN (SELECT id FROM test_pr)) THEN
        RAISE EXCEPTION 'Có lệnh nội bộ còn được đề nghị khác (dữ liệu seed) dùng chung, dừng lại';
    END IF;
END $$;

CREATE TEMP TABLE test_step ON COMMIT DROP AS
SELECT s.id FROM wf.approval_step s WHERE s.entity_type = 'proc.purchase_request' AND s.entity_id IN (SELECT id FROM test_pr);

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

CREATE TEMP TABLE test_unit ON COMMIT DROP AS
SELECT id FROM core.org_unit WHERE code ~ '^E2E_[0-9]+';
CREATE TEMP TABLE test_pos ON COMMIT DROP AS
SELECT id FROM core.position WHERE org_unit_id IN (SELECT id FROM test_unit) OR name ~ ' (mv|mu)[0-9a-z]{6}$';
CREATE TEMP TABLE test_person ON COMMIT DROP AS
SELECT id, full_name, idp_subject FROM core.person
WHERE full_name ~ '^(Người Thử|Trần Thị Thử) '
   OR id IN (SELECT a.person_id FROM core.assignment a WHERE a.position_id IN (SELECT id FROM test_pos)
             AND NOT EXISTS (SELECT FROM core.assignment b WHERE b.person_id = a.person_id
                                                             AND b.position_id NOT IN (SELECT id FROM test_pos)));

\echo === Tài khoản, đơn vị, vị trí thử E2E sẽ xóa ===
SELECT 'người' AS loai, full_name AS ten FROM test_person
UNION ALL SELECT 'đơn vị', u.code || ' ' || u.name FROM core.org_unit u WHERE u.id IN (SELECT id FROM test_unit)
UNION ALL SELECT 'vị trí', p.name FROM core.position p WHERE p.id IN (SELECT id FROM test_pos)
ORDER BY 1, 2;

DO $$
DECLARE s text;
BEGIN
    FOR s IN SELECT idp_subject FROM test_person WHERE idp_subject IS NOT NULL LOOP
        RAISE NOTICE 'KEYCLOAK %', s;
    END LOOP;
END $$;

DELETE FROM chat.member WHERE person_id IN (SELECT id FROM test_person);
DELETE FROM collab.notification WHERE recipient_id IN (SELECT id FROM test_person) OR actor_id IN (SELECT id FROM test_person);
UPDATE hr.onboarding_request SET person_id = NULL WHERE person_id IN (SELECT id FROM test_person);
DELETE FROM core.delegation WHERE delegator_id IN (SELECT id FROM test_person) OR delegate_id IN (SELECT id FROM test_person)
    OR position_id IN (SELECT id FROM test_pos);
DELETE FROM core.team_member WHERE person_id IN (SELECT id FROM test_person);
DELETE FROM core.role_grant WHERE person_id IN (SELECT id FROM test_person) OR position_id IN (SELECT id FROM test_pos)
    OR scope_unit_id IN (SELECT id FROM test_unit) OR org_unit_id IN (SELECT id FROM test_unit);
DELETE FROM core.assignment WHERE person_id IN (SELECT id FROM test_person) OR position_id IN (SELECT id FROM test_pos);
CREATE TEMP TABLE keep_pos ON COMMIT DROP AS
SELECT DISTINCT x AS id FROM hr.personnel_decision d,
    unnest(ARRAY[d.issuer_position_id, d.source_position_id, d.target_position_id]) x
WHERE x IN (SELECT id FROM test_pos);
CREATE TEMP TABLE keep_person ON COMMIT DROP AS
SELECT DISTINCT x AS id FROM hr.personnel_decision d, unnest(ARRAY[d.issuer_id, d.person_id]) x
WHERE x IN (SELECT id FROM test_person);
CREATE TEMP TABLE keep_unit ON COMMIT DROP AS
SELECT DISTINCT a.id FROM core.position p
JOIN core.org_unit u ON u.id = p.org_unit_id
JOIN core.org_unit a ON a.tenant_id = u.tenant_id AND u.path <@ a.path
WHERE p.id IN (SELECT id FROM keep_pos) AND a.id IN (SELECT id FROM test_unit);

UPDATE core.position SET reports_to_id = NULL
WHERE reports_to_id IN (SELECT id FROM test_pos) AND id NOT IN (SELECT id FROM keep_pos);
DELETE FROM core.position WHERE id IN (SELECT id FROM test_pos) AND id NOT IN (SELECT id FROM keep_pos);
UPDATE core.position SET valid_period = tstzrange(lower(valid_period), greatest(lower(valid_period), now()))
WHERE id IN (SELECT id FROM keep_pos) AND (upper_inf(valid_period) OR upper(valid_period) > now());
DELETE FROM core.person WHERE id IN (SELECT id FROM test_person) AND id NOT IN (SELECT id FROM keep_person);
UPDATE core.person SET idp_subject = NULL WHERE id IN (SELECT id FROM keep_person);
DELETE FROM core.org_unit WHERE id IN (SELECT id FROM test_unit) AND id NOT IN (SELECT id FROM keep_unit);
UPDATE core.org_unit SET valid_period = tstzrange(lower(valid_period), greatest(lower(valid_period), now()))
WHERE id IN (SELECT id FROM keep_unit) AND (upper_inf(valid_period) OR upper(valid_period) > now());

\echo === Còn lại ===
SELECT (SELECT count(*) FROM proc.purchase_request) AS de_nghi,
       (SELECT count(*) FROM ic.ic_order) AS lenh_noi_bo,
       (SELECT count(*) FROM wf.task WHERE status = 'OPEN') AS viec_dang_cho,
       (SELECT count(*) FROM core.person WHERE idp_subject IS NOT NULL) AS nguoi_co_tai_khoan;

:finish;
