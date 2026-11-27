-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

-- Nhận hàng, hóa đơn nhà cung cấp, thanh toán, đối trừ công nợ nội bộ, sửa quy tắc hạn mức duyệt (067).

SELECT test.fixture();

INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'KE_TOAN', 'Kế toán'), (test.id('TDX'), 'KHO', 'Kho');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT test.id('TDX'), r.id, p FROM core.role r,
       unnest(ARRAY['fin.payable.read', 'fin.payable.manage', 'wf.approval_rule.manage']) p
WHERE r.code = 'KE_TOAN';
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT test.id('TDX'), id, 'proc.goods_receipt.create' FROM core.role WHERE code = 'KHO';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), id, test.id('P_TGD'), 'TENANT' FROM core.role WHERE code = 'KE_TOAN';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), id, test.id(p), 'TENANT' FROM core.role, unnest(ARRAY['P_TP_MH_DT', 'P_TP_KD_CHIP']) p
WHERE code = 'KHO';

INSERT INTO mdm.partner (tenant_id, code, name) VALUES (test.id('TDX'), 'NCC1', 'Nhà cung cấp 1');
INSERT INTO mdm.partner (tenant_id, code, name, internal_unit_id) VALUES
    (test.id('TDX'), 'NB_CHIP', 'Công ty Chip X', test.id('CHIP')),
    (test.id('TDX'), 'NB_DT', 'Công ty Điện thoại X', test.id('DT'));
SELECT test.put(code, id) FROM mdm.partner WHERE tenant_id = test.id('TDX');

-- Đề nghị của Điện thoại X mua của nhà cung cấp ngoài: 10 cái x 1.000.000.
SELECT test.pr('pr1', 'c', 'P_NV_MH_DT', 0, false);
UPDATE proc.purchase_request SET partner_id = test.id('NCC1') WHERE id = test.id('pr1');
INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
VALUES (test.id('pr1'), 'Màn hình', 'cái', 10, 1000000);
SELECT test.put('pr1_l1', id) FROM proc.purchase_request_item WHERE request_id = test.id('pr1');

SELECT test.throws($$ SELECT proc.post_goods_receipt(test.id('pr1'), test.id('tp_mh_dt'),
                       jsonb_build_array(jsonb_build_object('request_item_id', test.id('pr1_l1'), 'quantity', 1))) $$,
                   '%đề nghị đã duyệt%', 'nháp chưa nhận hàng được');
SELECT proc.submit_purchase_request(test.id('pr1'), test.id('c'));
SELECT test.approve('pr1', test.assignee('pr1'));
SELECT test.eq(test.status('pr1'), 'APPROVED', 'đề nghị đã duyệt');

SELECT test.throws($$ SELECT proc.post_goods_receipt(test.id('pr1'), test.id('c'),
                       jsonb_build_array(jsonb_build_object('request_item_id', test.id('pr1_l1'), 'quantity', 1))) $$,
                   '%proc.goods_receipt.create%', 'không có quyền thì không ghi nhận hàng');
SELECT test.put('gr1', proc.post_goods_receipt(test.id('pr1'), test.id('tp_mh_dt'),
       jsonb_build_array(jsonb_build_object('request_item_id', test.id('pr1_l1'), 'quantity', 6)), 'Đợt 1'));
SELECT test.ok((SELECT doc_no FROM proc.goods_receipt WHERE id = test.id('gr1')) ~ '^GR-\d{4}-000001$', 'số phiếu GR');
SELECT test.eq((SELECT amount FROM proc.goods_receipt WHERE id = test.id('gr1')), 6000000.00, 'giá trị nhận theo đơn giá');
SELECT test.throws($$ SELECT proc.post_goods_receipt(test.id('pr1'), test.id('tp_mh_dt'),
                       jsonb_build_array(jsonb_build_object('request_item_id', test.id('pr1_l1'), 'quantity', 5))) $$,
                   '%chỉ còn 4.000%', 'không nhận quá số lượng còn lại');

-- Hóa đơn 10 triệu khi mới nhận 6 triệu: chưa khớp, không trả được.
SELECT test.throws($$ SELECT fin.record_invoice(test.id('pr1'), test.id('c'), 'HD001', current_date, 10000000) $$,
                   '%fin.payable.manage%', 'nhân viên không ghi hóa đơn');
SELECT test.put('inv1', fin.record_invoice(test.id('pr1'), test.id('tgd'), 'HD001', current_date, 10000000,
                                           current_date + 30));
SELECT test.eq((SELECT match_status FROM fin.invoice WHERE id = test.id('inv1')), 'OVER_RECEIPT', 'vượt hàng đã nhận');
SELECT test.eq((SELECT company_id FROM fin.invoice WHERE id = test.id('inv1')), test.id('DT'), 'công ty bên mua');
SELECT test.throws($$ SELECT fin.record_payment(test.id('inv1'), test.id('tgd'), 1000, 'TRANSFER') $$,
                   '%chưa khớp hàng đã nhận%', 'hóa đơn chưa khớp không trả được');
SELECT test.throws($$ SELECT fin.record_invoice(test.id('pr1'), test.id('tgd'), 'HD001', current_date, 1) $$,
                   '%đã được ghi%', 'một số hóa đơn nhà cung cấp chỉ ghi một lần');

-- Nhận nốt hàng: hóa đơn khớp trở lại, trả hai lần.
SELECT proc.post_goods_receipt(test.id('pr1'), test.id('tp_mh_dt'),
       jsonb_build_array(jsonb_build_object('request_item_id', test.id('pr1_l1'), 'quantity', 4)));
SELECT test.eq((SELECT match_status FROM fin.invoice WHERE id = test.id('inv1')), 'MATCHED', 'nhận đủ thì khớp');
SELECT test.throws($$ SELECT fin.record_payment(test.id('inv1'), test.id('tgd'), 20000000, 'TRANSFER') $$,
                   '%không quá%', 'không trả quá số còn nợ');
SELECT fin.record_payment(test.id('inv1'), test.id('tgd'), 4000000, 'TRANSFER', 'UNC 01');
SELECT test.eq((SELECT status FROM fin.invoice WHERE id = test.id('inv1')), 'PARTIAL', 'trả một phần');
SELECT fin.record_payment(test.id('inv1'), test.id('tgd'), 6000000, 'CASH');
SELECT test.eq((SELECT status || ':' || paid_amount FROM fin.invoice WHERE id = test.id('inv1')), 'PAID:10000000.00',
               'trả đủ');
SELECT test.throws($$ SELECT fin.void_invoice(test.id('inv1'), test.id('tgd')) $$, '%chưa thanh toán%',
                   'hóa đơn đã trả không hủy được');

-- Đối trừ: Điện thoại X nợ Chip X 30 triệu, Chip X nợ Điện thoại X 12 triệu -> đối trừ 12 triệu.
CREATE FUNCTION pg_temp.ic_invoice(p_key text, p_person text, p_position text, p_partner text, p_amount numeric,
                                   p_date date) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_line uuid;
BEGIN
    PERFORM test.pr(p_key, p_person, p_position, 0, false);
    UPDATE proc.purchase_request SET partner_id = test.id(p_partner) WHERE id = test.id(p_key);
    INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
    VALUES (test.id(p_key), 'Hàng nội bộ', 'lô', 1, p_amount) RETURNING id INTO v_line;
    PERFORM proc.submit_purchase_request(test.id(p_key), test.id(p_person));
    PERFORM test.approve(p_key, test.assignee(p_key));
    PERFORM proc.post_goods_receipt(test.id(p_key), test.id('tgd'),
            jsonb_build_array(jsonb_build_object('request_item_id', v_line, 'quantity', 1)));
    RETURN fin.record_invoice(test.id(p_key), test.id('tgd'), p_key, p_date, p_amount);
END $$;

INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('TDX'), id, test.id('P_TGD'), 'TENANT' FROM core.role WHERE code = 'KHO';
SELECT test.put('ab1', pg_temp.ic_invoice('dt_chip_1', 'c', 'P_NV_MH_DT', 'NB_CHIP', 20000000, current_date - 10));
SELECT test.put('ab2', pg_temp.ic_invoice('dt_chip_2', 'd', 'P_NV2_MH_DT', 'NB_CHIP', 10000000, current_date - 5));
SELECT test.put('ba1', pg_temp.ic_invoice('chip_dt_1', 'a', 'P_NV_KD_CHIP', 'NB_DT', 12000000, current_date - 7));
SELECT test.eq((SELECT seller_company_id FROM fin.invoice WHERE id = test.id('ab1')), test.id('CHIP'), 'công ty bên bán');
SELECT test.eq((SELECT a_owes_b || '/' || b_owes_a || '/' || nettable
                FROM fin.netting_position(test.id('TDX'), test.id('DT'), test.id('CHIP'))),
               '30000000.00/12000000.00/12000000.00', 'vị thế công nợ hai chiều');
SELECT test.throws($$ SELECT fin.run_netting(test.id('TDX'), test.id('DT'), test.id('CHIP'), test.id('c')) $$,
                   '%cả hai công ty%', 'cần quyền ở cả hai công ty');
SELECT test.throws($$ SELECT fin.run_netting(test.id('TDX'), test.id('DT'), test.id('DT_MH'), test.id('tgd')) $$,
                   '%hai pháp nhân%', 'chỉ đối trừ giữa pháp nhân');
SELECT test.put('net1', fin.run_netting(test.id('TDX'), test.id('DT'), test.id('CHIP'), test.id('tgd'), 'Kỳ 11/2026'));
SELECT test.eq((SELECT amount FROM fin.netting WHERE id = test.id('net1')), 12000000.00, 'đối trừ phần nhỏ hơn');
SELECT test.eq((SELECT status || ':' || paid_amount FROM fin.invoice WHERE id = test.id('ab1')), 'PARTIAL:12000000.00',
               'trừ vào hóa đơn cũ nhất của bên nợ nhiều');
SELECT test.eq((SELECT status FROM fin.invoice WHERE id = test.id('ab2')), 'OPEN', 'hóa đơn mới hơn chưa bị trừ');
SELECT test.eq((SELECT status FROM fin.invoice WHERE id = test.id('ba1')), 'PAID', 'bên nợ ít được trừ hết');
SELECT test.eq((SELECT count(*)::int FROM fin.payment WHERE netting_id = test.id('net1') AND method = 'NETTING'), 2,
               'mỗi hóa đơn được trừ có một phiếu NETTING');
SELECT test.eq((SELECT nettable FROM fin.netting_position(test.id('TDX'), test.id('DT'), test.id('CHIP'))), 0.00,
               'sau đối trừ không còn nợ hai chiều');
SELECT test.throws($$ SELECT fin.run_netting(test.id('TDX'), test.id('CHIP'), test.id('DT'), test.id('tgd')) $$,
                   '%Không có công nợ hai chiều%', 'không đối trừ lần hai');

-- Quy tắc hạn mức duyệt.
SELECT test.throws($$ SELECT wf.replace_approval_rules(test.id('TDX'), test.id('c'), 'PURCHASE_REQUEST', NULL,
                       '[{"min_amount": 0, "step_order": 1}]') $$, '%wf.approval_rule.manage%', 'cần quyền');
SELECT test.throws($$ SELECT wf.replace_approval_rules(test.id('TDX'), test.id('tgd'), 'PURCHASE_REQUEST', NULL,
                       '[{"min_amount": 1000, "step_order": 1}]') $$, '%từ 0 đồng%', 'phải phủ từ 0 đồng');
SELECT test.eq(wf.replace_approval_rules(test.id('TDX'), test.id('tgd'), 'PURCHASE_REQUEST', NULL,
               '[{"min_amount": 0, "max_amount": 20000000, "step_order": 1},
                 {"min_amount": 20000000, "step_order": 1, "approver_unit_type": "CONG_TY"}]'), 2, 'ghi hai quy tắc');
SELECT test.eq((SELECT count(*)::int FROM wf.approval_rule WHERE tenant_id = test.id('TDX')
                  AND process_code = 'PURCHASE_REQUEST' AND scope_unit_id IS NULL AND valid_period @> now()),
               2, 'quy tắc cũ hết hiệu lực, còn hai quy tắc mới');
SELECT test.eq((SELECT count(*)::int FROM wf.approval_rule WHERE tenant_id = test.id('TDX')
                  AND process_code = 'PURCHASE_REQUEST' AND NOT (valid_period @> now())), 4, 'lịch sử giữ lại');
SELECT test.pr('pr_big', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq(test.assignee('pr_big'), 'gd_dt', 'đề nghị 30 triệu nay lên giám đốc công ty');
