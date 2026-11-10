-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();

INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'BAN_HANG_NOI_BO', 'Bán hàng nội bộ');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, p FROM core.role, unnest(ARRAY['ic.order.read', 'ic.order.confirm']) p
WHERE code = 'BAN_HANG_NOI_BO';
INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope, scope_unit_id)
SELECT test.id('TDX'), id, test.id('CHIP_KD'), 'SUBTREE', test.id('CHIP') FROM core.role WHERE code = 'BAN_HANG_NOI_BO';

INSERT INTO mdm.partner (tenant_id, code, name, internal_unit_id) VALUES
    (test.id('TDX'), 'NB_CHIP', 'Công ty Chip X', test.id('CHIP')),
    (test.id('TDX'), 'NB_DT', 'Công ty Điện thoại X', test.id('DT'));
INSERT INTO test.ids SELECT code, id FROM mdm.partner WHERE code IN ('NB_CHIP', 'NB_DT');
INSERT INTO mdm.item (tenant_id, code, name, uom, ref_price) VALUES
    (test.id('TDX'), 'PMIC', 'Chip quản lý nguồn PMIC', 'cái', 12000),
    (test.id('TDX'), 'SOC', 'SoC mẫu thử', 'cái', 300000),
    (test.id('TDX'), 'VC', 'Vận chuyển', 'chuyến', NULL);
INSERT INTO test.ids SELECT code, id FROM mdm.item WHERE code IN ('PMIC', 'SOC', 'VC');

INSERT INTO mfg.lot (tenant_id, lot_no, item_id, org_unit_id, quantity, uom, produced_on, status) VALUES
    (test.id('TDX'), 'PMIC-A', test.id('PMIC'), test.id('CHIP'), 1000, 'cái', current_date - 10, 'RELEASED'),
    (test.id('TDX'), 'PMIC-GIU', test.id('PMIC'), test.id('CHIP'), 1000, 'cái', current_date - 9, 'ON_HOLD'),
    (test.id('TDX'), 'SOC-A', test.id('SOC'), test.id('CHIP'), 1000, 'cái', current_date - 8, 'RELEASED'),
    (test.id('TDX'), 'PMIC-DT', test.id('PMIC'), test.id('DT'), 1000, 'cái', current_date - 7, 'RELEASED');
INSERT INTO test.ids SELECT lot_no, id FROM mfg.lot;

CREATE FUNCTION pg_temp.ipr(p_key text, p_partner text, p_pmic numeric, p_with_vc boolean DEFAULT true,
                            p_submit boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
    INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id, partner_id)
    VALUES (test.id('TDX'), p_key, test.id('c'), test.id('P_NV_MH_DT'), test.id(p_partner))
    RETURNING test.put(p_key, id) INTO v;
    IF p_pmic > 0 THEN
        INSERT INTO proc.purchase_request_item (request_id, item_id, quantity, unit_price)
        VALUES (v, test.id('PMIC'), p_pmic, 12000);
    END IF;
    IF p_with_vc THEN
        INSERT INTO proc.purchase_request_item (request_id, item_id, quantity, unit_price) VALUES (v, test.id('VC'), 1, 500000);
    END IF;
    IF p_submit THEN
        PERFORM proc.submit_purchase_request(v, test.id('c'));
    END IF;
    RETURN v;
END $$;

CREATE FUNCTION pg_temp.ic(p_pr text) RETURNS ic.ic_order
LANGUAGE sql STABLE AS $$
    SELECT o.* FROM ic.ic_order o JOIN proc.purchase_request r ON r.ic_order_id = o.id WHERE r.id = test.id(p_pr)
$$;

CREATE FUNCTION pg_temp.line(p_pr text, p_item text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT i.id::text FROM ic.ic_order_item i WHERE i.order_id = (pg_temp.ic(p_pr)).id AND i.item_id = test.id(p_item)
$$;

SELECT pg_temp.ipr('pr_cung_cty', 'NB_DT', 10, true, false);
SELECT test.throws($$SELECT proc.submit_purchase_request(test.id('pr_cung_cty'), test.id('c'))$$,
                   '%chính công ty%', 'Không đặt hàng nội bộ từ chính công ty của mình');
SELECT pg_temp.ipr('pr_khong_dong', 'NB_CHIP', 0, false, false);
UPDATE proc.purchase_request SET total_amount = 1000000 WHERE id = test.id('pr_khong_dong');
SELECT test.throws($$SELECT proc.submit_purchase_request(test.id('pr_khong_dong'), test.id('c'))$$,
                   '%cần có dòng hàng%', 'Đề nghị mua nội bộ phải có dòng hàng');

SELECT pg_temp.ipr('pr1', 'NB_CHIP', 600);
SELECT test.eq(test.assignee('pr1'), 'tp_mh_dt', 'Đề nghị nội bộ đi chuỗi duyệt như thường');
SELECT test.ok(pg_temp.ic('pr1') IS NULL, 'Chưa duyệt thì chưa có đơn hàng nội bộ');
SELECT test.approve('pr1', 'tp_mh_dt');
SELECT test.eq(test.status('pr1'), 'APPROVED', 'Đề nghị đã duyệt');
SELECT test.eq((pg_temp.ic('pr1')).status, 'PENDING', 'Đơn hàng nội bộ chờ bên bán xác nhận');
SELECT test.ok((pg_temp.ic('pr1')).doc_no ~ '^IC-\d{4}-000001$', 'Số chứng từ đơn hàng nội bộ có tiền tố IC');
SELECT test.eq((pg_temp.ic('pr1')).seller_unit_id, test.id('CHIP'), 'Bên bán là công ty của nhà cung cấp nội bộ');
SELECT test.eq((pg_temp.ic('pr1')).buyer_unit_id, test.id('DT'), 'Bên mua là công ty của đơn vị lập đề nghị');
SELECT test.eq((pg_temp.ic('pr1')).created_by, test.id('c'), 'Người đặt là người lập đề nghị');
SELECT test.eq((pg_temp.ic('pr1')).total_amount, 7700000.00, 'Tổng tiền theo đề nghị');
SELECT test.eq((SELECT count(*) FROM ic.ic_order_item WHERE order_id = (pg_temp.ic('pr1')).id), 2::bigint,
               'Chép đủ dòng hàng');

SELECT test.eq((SELECT array_agg(test.key(recipient_id) ORDER BY test.key(recipient_id)) FROM collab.notification
                WHERE kind = 'IC_ORDER_NEW' AND entity_id = (pg_temp.ic('pr1')).id),
               ARRAY['a', 'tp_kd_chip'], 'Người xác nhận được của bên bán nhận thông báo đơn mới');

SELECT test.ok(wf.entity_can_read('ic.ic_order', (pg_temp.ic('pr1')).id, test.id('c')), 'Người đặt xem được');
SELECT test.ok(wf.entity_can_read('ic.ic_order', (pg_temp.ic('pr1')).id, test.id('tp_mh_dt')), 'Người duyệt đề nghị xem được');
SELECT test.ok(wf.entity_can_read('ic.ic_order', (pg_temp.ic('pr1')).id, test.id('a')), 'Bên bán xem được');
SELECT test.ok(NOT wf.entity_can_read('ic.ic_order', (pg_temp.ic('pr1')).id, test.id('gd_gd')),
               'Công ty không liên quan không xem được');

SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('c'))$$, (pg_temp.ic('pr1')).id),
                   '%Không có quyền xác nhận%', 'Bên mua không xác nhận được');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('a'))$$, (pg_temp.ic('pr1')).id),
                   '%chọn lô xuất%', 'Mặt hàng có quản lý lô phải ghi lô xuất');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('a'), %L)$$, (pg_temp.ic('pr1')).id,
                          jsonb_build_object(pg_temp.line('pr1', 'PMIC'), test.id('PMIC-GIU'))),
                   '%đang bị giữ%', 'Lô đang bị giữ không xuất được');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('a'), %L)$$, (pg_temp.ic('pr1')).id,
                          jsonb_build_object(pg_temp.line('pr1', 'PMIC'), test.id('PMIC-DT'))),
                   '%không thuộc công ty bán%', 'Lô phải của công ty bán');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('a'), %L)$$, (pg_temp.ic('pr1')).id,
                          jsonb_build_object(pg_temp.line('pr1', 'PMIC'), test.id('SOC-A'))),
                   '%không phải của mặt hàng%', 'Lô phải đúng mặt hàng');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('a'), %L)$$, (pg_temp.ic('pr1')).id,
                          jsonb_build_object(gen_random_uuid(), test.id('PMIC-A'))),
                   '%không thuộc đơn này%', 'Dòng hàng phải thuộc đơn');
SELECT test.eq((pg_temp.ic('pr1')).status, 'PENDING', 'Lỗi thì đơn vẫn chờ');

SELECT test.put('po1', ic.confirm_order((pg_temp.ic('pr1')).id, test.id('a'),
                                        jsonb_build_object(pg_temp.line('pr1', 'PMIC'), test.id('PMIC-A'))));
SELECT test.eq((pg_temp.ic('pr1')).status, 'CONFIRMED', 'Đơn đã xác nhận');
SELECT test.eq((pg_temp.ic('pr1')).decided_by, test.id('a'), 'Ghi người xác nhận');
SELECT test.eq((SELECT lot_id FROM ic.ic_order_item WHERE id::text = pg_temp.line('pr1', 'PMIC')), test.id('PMIC-A'),
               'Dòng hàng ghi lô xuất');
SELECT test.ok((SELECT doc_no FROM proc.purchase_order WHERE id = test.id('po1')) ~ '^PO-\d{4}-000001$',
               'Sinh đơn mua có tiền tố PO');
SELECT test.eq((SELECT (request_id, partner_id, org_unit_id, buyer_id, total_amount)::text FROM proc.purchase_order
                WHERE id = test.id('po1')),
               (test.id('pr1'), test.id('NB_CHIP'), test.id('DT_MH'), test.id('c'), 7700000.00)::text,
               'Đơn mua thuộc bên mua, nhà cung cấp là Chip X');
SELECT test.eq((SELECT lot_id FROM proc.purchase_order_item WHERE order_id = test.id('po1') AND item_id = test.id('PMIC')),
               test.id('PMIC-A'), 'Đơn mua mang lô nhận về');
SELECT test.eq((SELECT count(*) FROM collab.notification WHERE kind = 'IC_ORDER_CONFIRMED'
                AND recipient_id = test.id('c') AND actor_id = test.id('a')), 1::bigint, 'Báo người đặt đơn đã xác nhận');
SELECT test.ok(proc.purchase_order_can_read((SELECT o FROM proc.purchase_order o WHERE id = test.id('po1')),
                                            json_build_object('x-hasura-user-id', test.id('c'))),
               'Bên mua xem được đơn mua');
SELECT test.ok(NOT proc.purchase_order_can_read((SELECT o FROM proc.purchase_order o WHERE id = test.id('po1')),
                                                json_build_object('x-hasura-user-id', test.id('a'))),
               'Bên bán không xem đơn mua của bên mua');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('a'))$$, (pg_temp.ic('pr1')).id),
                   '%trạng thái CONFIRMED%', 'Không xác nhận lại');

SELECT pg_temp.ipr('pr2', 'NB_CHIP', 500, false);
SELECT test.approve('pr2', 'tp_mh_dt');
SELECT test.throws(format($$SELECT ic.confirm_order(%L, test.id('tp_kd_chip'), %L)$$, (pg_temp.ic('pr2')).id,
                          jsonb_build_object(pg_temp.line('pr2', 'PMIC'), test.id('PMIC-A'))),
                   '%PMIC-A không đủ số lượng: cần 1100%', 'Không xuất quá số lượng lô');

SELECT test.throws(format($$SELECT ic.reject_order(%L, test.id('tp_kd_chip'), ' ')$$, (pg_temp.ic('pr2')).id),
                   '%phải ghi lý do%', 'Từ chối phải ghi lý do');
SELECT ic.reject_order((pg_temp.ic('pr2')).id, test.id('tp_kd_chip'), 'Hết hàng PMIC tháng này');
SELECT test.eq((pg_temp.ic('pr2')).status, 'REJECTED', 'Đơn bị từ chối');
SELECT test.eq((SELECT body FROM collab.notification WHERE kind = 'IC_ORDER_REJECTED' AND recipient_id = test.id('c')),
               'Hết hàng PMIC tháng này', 'Báo người đặt kèm lý do');
SELECT test.eq((SELECT count(*) FROM proc.purchase_order WHERE request_id = test.id('pr2')), 0::bigint,
               'Đơn bị từ chối không sinh đơn mua');

SELECT pg_temp.ipr('pr3', 'NB_CHIP', 10, false);
SELECT test.approve('pr3', 'tp_mh_dt');
SELECT test.throws(format($$SELECT ic.cancel_order(%L, test.id('a'), 'x')$$, (pg_temp.ic('pr3')).id),
                   '%Chỉ người đặt hàng%', 'Bên bán không hủy được');
SELECT ic.cancel_order((pg_temp.ic('pr3')).id, test.id('c'), 'Đã mua được ở nơi khác');
SELECT test.eq((pg_temp.ic('pr3')).status, 'CANCELLED', 'Đơn đã hủy');
SELECT test.eq((SELECT count(*) FROM collab.notification WHERE kind = 'IC_ORDER_CANCELLED'
                AND entity_id = (pg_temp.ic('pr3')).id), 2::bigint, 'Báo bên bán đơn bị hủy');
SELECT test.throws(format($$SELECT ic.reject_order(%L, test.id('a'), 'x')$$, (pg_temp.ic('pr3')).id),
                   '%trạng thái CANCELLED%', 'Đơn đã hủy không xử lý tiếp');

INSERT INTO mdm.partner (tenant_id, code, name) VALUES (test.id('TDX'), 'NCC_A', 'Nhà cung cấp A');
INSERT INTO test.ids SELECT code, id FROM mdm.partner WHERE code = 'NCC_A';
SELECT pg_temp.ipr('pr_ngoai', 'NCC_A', 10);
SELECT test.approve('pr_ngoai', 'tp_mh_dt');
SELECT test.ok(pg_temp.ic('pr_ngoai') IS NULL, 'Nhà cung cấp ngoài: không có đơn hàng nội bộ');

SELECT test.ok(collab.entity_label('ic.ic_order', (pg_temp.ic('pr1')).id) ~ '^IC-\d{4}-000001 – Công ty Điện thoại X đặt Công ty Chip X$',
               'Nhãn đơn hàng nội bộ');
INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
VALUES (test.id('TDX'), 'ic.ic_order', (pg_temp.ic('pr1')).id, test.id('a'), 'Đã xuất lô PMIC-A');
SELECT test.eq((SELECT count(*) FROM collab.comment WHERE entity_type = 'ic.ic_order'), 1::bigint,
               'Bên bán bình luận được trên đơn');
