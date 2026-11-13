-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
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

CREATE SCHEMA test;

CREATE TABLE test.ids (key text PRIMARY KEY, id uuid NOT NULL UNIQUE);

CREATE FUNCTION test.id(p_key text) RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE v uuid;
BEGIN
    SELECT id INTO v FROM test.ids WHERE key = p_key;
    IF v IS NULL THEN
        RAISE EXCEPTION 'test.id: không có khóa %', p_key;
    END IF;
    RETURN v;
END $$;

CREATE FUNCTION test.key(p_id uuid) RETURNS text
LANGUAGE sql VOLATILE AS $$ SELECT coalesce((SELECT key FROM test.ids WHERE id = p_id), p_id::text) $$;

CREATE FUNCTION test.put(p_key text, p_id uuid) RETURNS uuid
LANGUAGE sql AS $$ INSERT INTO test.ids VALUES (p_key, p_id) RETURNING id $$;

CREATE FUNCTION test.ok(p_cond boolean, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond IS NOT TRUE THEN
        RAISE EXCEPTION 'KHÔNG ĐẠT: %', p_msg;
    END IF;
END $$;

CREATE FUNCTION test.eq(p_actual anyelement, p_expected anyelement, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'KHÔNG ĐẠT: % (nhận %, mong đợi %)', p_msg, p_actual, p_expected;
    END IF;
END $$;

CREATE FUNCTION test.throws(p_sql text, p_pattern text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE p_pattern THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'KHÔNG ĐẠT: % (lỗi khác mong đợi: %)', p_msg, SQLERRM;
    END;
    RAISE EXCEPTION 'KHÔNG ĐẠT: % (không báo lỗi)', p_msg;
END $$;

CREATE FUNCTION test.unit(p_tenant text, p_key text, p_parent text, p_type text, p_name text,
                          p_legal boolean DEFAULT false) RETURNS uuid
LANGUAGE sql AS $$
    WITH u AS (
        INSERT INTO core.org_unit (tenant_id, parent_id, unit_type_id, code, name, is_legal_entity, valid_period)
        VALUES (test.id(p_tenant),
                CASE WHEN p_parent IS NULL THEN NULL ELSE test.id(p_parent) END,
                test.id(p_tenant || ':' || p_type), p_key, p_name, p_legal,
                tstzrange(now() - interval '1 year', NULL))
        RETURNING id
    )
    SELECT test.put(p_key, u.id) FROM u
$$;

CREATE FUNCTION test.position(p_tenant text, p_key text, p_unit text, p_name text,
                              p_head boolean DEFAULT false, p_reports_to text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
    WITH p AS (
        INSERT INTO core.position (tenant_id, org_unit_id, name, is_head, reports_to_id, valid_period)
        VALUES (test.id(p_tenant), test.id(p_unit), p_name, p_head,
                CASE WHEN p_reports_to IS NULL THEN NULL ELSE test.id(p_reports_to) END,
                tstzrange(now() - interval '1 year', NULL))
        RETURNING id
    )
    SELECT test.put(p_key, p.id) FROM p
$$;

CREATE FUNCTION test.person(p_tenant text, p_key text, p_name text, p_subject text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
    WITH p AS (
        INSERT INTO core.person (tenant_id, idp_subject, full_name)
        VALUES (test.id(p_tenant), coalesce(p_subject, p_key), p_name)
        RETURNING id
    )
    SELECT test.put(p_key, p.id) FROM p
$$;

CREATE FUNCTION test.assign(p_tenant text, p_person text, p_position text,
                            p_type text DEFAULT 'PRIMARY',
                            p_period tstzrange DEFAULT NULL,
                            p_contract_no text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period, contract_no)
    VALUES (test.id(p_tenant), test.id(p_person), test.id(p_position), p_type,
            coalesce(p_period, tstzrange(now() - interval '1 year', NULL)), p_contract_no)
    RETURNING id
$$;

CREATE FUNCTION test.end_assignment(p_person text, p_position text) RETURNS void
LANGUAGE sql AS $$
    UPDATE core.assignment SET valid_period = tstzrange(lower(valid_period), now())
    WHERE person_id = test.id(p_person) AND position_id = test.id(p_position) AND valid_period @> now()
$$;

CREATE FUNCTION test.pr(p_key text, p_person text, p_position text, p_amount numeric,
                        p_submit boolean DEFAULT true, p_ic_order uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
    INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id, total_amount, ic_order_id)
    SELECT p.tenant_id, p_key, test.id(p_person), test.id(p_position), p_amount, p_ic_order
    FROM core.person p WHERE p.id = test.id(p_person)
    RETURNING id INTO v;
    PERFORM test.put(p_key, v);
    IF p_submit THEN
        PERFORM proc.submit_purchase_request(v, test.id(p_person));
    END IF;
    RETURN v;
END $$;

CREATE FUNCTION test.open_task(p_pr text) RETURNS wf.task
LANGUAGE sql STABLE AS $$
    SELECT t.* FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
    WHERE s.entity_id = test.id(p_pr) AND t.status = 'OPEN'
$$;

CREATE FUNCTION test.assignee(p_pr text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT test.key((test.open_task(p_pr)).assignee_id) $$;

CREATE FUNCTION test.approve(p_pr text, p_actor text) RETURNS void
LANGUAGE sql AS $$ SELECT wf.act((test.open_task(p_pr)).id, test.id(p_actor), 'APPROVE') $$;

CREATE FUNCTION test.status(p_pr text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT status FROM proc.purchase_request WHERE id = test.id(p_pr) $$;

CREATE FUNCTION test.fixture() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    t text;
    k text;
BEGIN
    INSERT INTO core.tenant (code, name) VALUES ('TDX', 'Tập đoàn X'), ('BVX', 'Bệnh viện X'), ('CTY', 'Công ty Y');
    INSERT INTO test.ids SELECT code, id FROM core.tenant WHERE code IN ('TDX', 'BVX', 'CTY');
    INSERT INTO core.tenant_relation (parent_tenant_id, child_tenant_id) VALUES (test.id('TDX'), test.id('BVX'));

    FOREACH t IN ARRAY ARRAY['TDX', 'BVX', 'CTY'] LOOP
        FOREACH k IN ARRAY ARRAY['TAP_DOAN', 'CONG_TY', 'BENH_VIEN', 'KHOI', 'PHONG'] LOOP
            INSERT INTO core.catalog_item (tenant_id, catalog, code, name)
            VALUES (test.id(t), 'UNIT_TYPE', k, k);
            INSERT INTO test.ids SELECT t || ':' || k, id FROM core.catalog_item
            WHERE tenant_id = test.id(t) AND catalog = 'UNIT_TYPE' AND code = k;
        END LOOP;
    END LOOP;

    PERFORM test.unit('TDX', 'ME', NULL, 'TAP_DOAN', 'Tập đoàn X', true);
    PERFORM test.unit('TDX', 'CHIP', 'ME', 'CONG_TY', 'Công ty Chip X', true);
    PERFORM test.unit('TDX', 'CHIP_KD', 'CHIP', 'PHONG', 'Phòng Kinh doanh B2B');
    PERFORM test.unit('TDX', 'DT', 'ME', 'CONG_TY', 'Công ty Điện thoại X', true);
    PERFORM test.unit('TDX', 'DT_MH', 'DT', 'PHONG', 'Phòng Mua hàng');
    PERFORM test.unit('TDX', 'GD', 'ME', 'CONG_TY', 'Công ty Gia dụng X', true);
    PERFORM test.unit('TDX', 'GD_KT', 'GD', 'PHONG', 'Phòng Kỹ thuật');

    PERFORM test.position('TDX', 'P_TGD', 'ME', 'Tổng giám đốc', true);
    PERFORM test.position('TDX', 'P_PTGD', 'ME', 'Phó tổng giám đốc', false, 'P_TGD');
    PERFORM test.position('TDX', 'P_GD_CHIP', 'CHIP', 'Giám đốc Chip X', true);
    PERFORM test.position('TDX', 'P_TP_KD_CHIP', 'CHIP_KD', 'Trưởng phòng Kinh doanh B2B', true);
    PERFORM test.position('TDX', 'P_NV_KD_CHIP', 'CHIP_KD', 'Chuyên viên kinh doanh');
    PERFORM test.position('TDX', 'P_GD_DT', 'DT', 'Giám đốc Điện thoại X', true);
    PERFORM test.position('TDX', 'P_TP_MH_DT', 'DT_MH', 'Trưởng phòng Mua hàng', true);
    PERFORM test.position('TDX', 'P_NV_MH_DT', 'DT_MH', 'Chuyên viên mua hàng 1');
    PERFORM test.position('TDX', 'P_NV2_MH_DT', 'DT_MH', 'Chuyên viên mua hàng 2');
    PERFORM test.position('TDX', 'P_GD_GD', 'GD', 'Giám đốc Gia dụng X', true);
    PERFORM test.position('TDX', 'P_TP_KT_GD', 'GD_KT', 'Trưởng phòng Kỹ thuật', true);
    PERFORM test.position('TDX', 'P_HD_KT_GD', 'GD_KT', 'Kỹ sư thuê theo hợp đồng', false, 'P_TP_KT_GD');

    PERFORM test.person('TDX', 'tgd', 'Tổng giám đốc');
    PERFORM test.person('TDX', 'ptgd', 'Phó tổng giám đốc');
    PERFORM test.person('TDX', 'gd_chip', 'Giám đốc Chip X');
    PERFORM test.person('TDX', 'tp_kd_chip', 'Trưởng phòng KD Chip X');
    PERFORM test.person('TDX', 'a', 'Anh A');
    PERFORM test.person('TDX', 'gd_dt', 'Giám đốc Điện thoại X');
    PERFORM test.person('TDX', 'tp_mh_dt', 'Trưởng phòng MH Điện thoại X');
    PERFORM test.person('TDX', 'c', 'Chị C');
    PERFORM test.person('TDX', 'd', 'Anh D');
    PERFORM test.person('TDX', 'gd_gd', 'Giám đốc Gia dụng X');
    PERFORM test.person('TDX', 'tp_kt_gd', 'Trưởng phòng KT Gia dụng X');
    PERFORM test.person('TDX', 'e', 'Chị E (chưa có vị trí)');

    PERFORM test.assign('TDX', 'tgd', 'P_TGD');
    PERFORM test.assign('TDX', 'ptgd', 'P_PTGD');
    PERFORM test.assign('TDX', 'gd_chip', 'P_GD_CHIP');
    PERFORM test.assign('TDX', 'tp_kd_chip', 'P_TP_KD_CHIP');
    PERFORM test.assign('TDX', 'a', 'P_NV_KD_CHIP');
    PERFORM test.assign('TDX', 'gd_dt', 'P_GD_DT');
    PERFORM test.assign('TDX', 'tp_mh_dt', 'P_TP_MH_DT');
    PERFORM test.assign('TDX', 'c', 'P_NV_MH_DT');
    PERFORM test.assign('TDX', 'd', 'P_NV2_MH_DT');
    PERFORM test.assign('TDX', 'gd_gd', 'P_GD_GD');
    PERFORM test.assign('TDX', 'tp_kt_gd', 'P_TP_KT_GD');

    INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, max_amount, step_order, approver_unit_type_id, valid_period)
    VALUES
        (test.id('TDX'), 'PURCHASE_REQUEST', 0,         50000000,  1, NULL,                     tstzrange(now() - interval '1 year', NULL)),
        (test.id('TDX'), 'PURCHASE_REQUEST', 50000000,  500000000, 1, test.id('TDX:CONG_TY'),   tstzrange(now() - interval '1 year', NULL)),
        (test.id('TDX'), 'PURCHASE_REQUEST', 500000000, NULL,      1, test.id('TDX:CONG_TY'),   tstzrange(now() - interval '1 year', NULL)),
        (test.id('TDX'), 'PURCHASE_REQUEST', 500000000, NULL,      2, test.id('TDX:TAP_DOAN'),  tstzrange(now() - interval '1 year', NULL));
    SET CONSTRAINTS ALL IMMEDIATE;
END $$;
