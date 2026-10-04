-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Cây tổ chức, vị trí, bổ nhiệm, tài khoản nhiều tenant (CONTEXT.md mục "Tổ chức").
SELECT test.fixture();

-- Cây: path tự tính, chặn vòng lặp, tái cấu trúc kéo theo cây con.
SELECT test.ok((SELECT path FROM core.org_unit WHERE id = test.id('CHIP_KD'))
               <@ (SELECT path FROM core.org_unit WHERE id = test.id('ME')),
               'Phòng KD Chip nằm trong cây Tập đoàn X');
SELECT test.throws(format('UPDATE core.org_unit SET parent_id = %L WHERE id = %L', test.id('CHIP_KD'), test.id('CHIP')),
                   '%cây con của nó%', 'Không đặt được công ty làm con của phòng thuộc chính nó');
UPDATE core.org_unit SET parent_id = test.id('DT') WHERE id = test.id('CHIP');
SELECT test.ok((SELECT path FROM core.org_unit WHERE id = test.id('CHIP_KD'))
               <@ (SELECT path FROM core.org_unit WHERE id = test.id('DT')),
               'Chuyển Chip X vào Điện thoại X thì phòng con đi theo');
UPDATE core.org_unit SET parent_id = test.id('ME') WHERE id = test.id('CHIP');

SELECT test.eq(core.company_of(test.id('CHIP_KD')), test.id('CHIP'), 'Công ty của Phòng KD là Chip X');

-- Vị trí trưởng: mỗi đơn vị đúng một.
SELECT test.throws(format($$INSERT INTO core.position (tenant_id, org_unit_id, name, is_head)
                            VALUES (%L, %L, 'Trưởng phòng thứ hai', true)$$, test.id('TDX'), test.id('CHIP_KD')),
                   '%position_one_head_per_unit%', 'Đơn vị không có hai vị trí trưởng');

-- Vị trí là một ghế: tối đa một người ngồi.
SELECT test.throws($$SELECT test.assign('TDX', 'e', 'P_NV_KD_CHIP', 'CONCURRENT')$$,
                   '%assignment_one_occupant_per_position%', 'Ghế đã có người thì không bổ nhiệm thêm');
-- Mỗi người một vị trí giữ chính.
SELECT test.throws($$SELECT test.assign('TDX', 'a', 'P_NV2_MH_DT')$$,
                   '%assignment_one_primary_per_person%', 'Một người không giữ chính hai vị trí');
-- Kiêm nhiệm ở công ty khác thì được.
SELECT test.position('TDX', 'P_NV3_MH_DT', 'DT_MH', 'Chuyên viên mua hàng 3');
SELECT test.assign('TDX', 'e', 'P_NV3_MH_DT', 'CONCURRENT');

-- Quản lý trực tiếp / vị trí cấp trên.
SELECT test.eq(core.manager_position(test.id('P_NV_KD_CHIP')), test.id('P_TP_KD_CHIP'), 'Chuyên viên → trưởng phòng');
SELECT test.eq(core.manager_position(test.id('P_TP_KD_CHIP')), test.id('P_GD_CHIP'), 'Trưởng phòng → giám đốc công ty');
SELECT test.eq(core.manager_position(test.id('P_GD_CHIP')), test.id('P_TGD'), 'Giám đốc công ty → TGĐ');
SELECT test.eq(core.manager_position(test.id('P_PTGD')), test.id('P_TGD'), 'Phó TGĐ báo cáo cho TGĐ');
SELECT test.eq(core.manager_position(test.id('P_HD_KT_GD')), test.id('P_TP_KT_GD'), 'Ghế hợp đồng báo cáo cho người quản lý hợp đồng');
SELECT test.ok(core.manager_position(test.id('P_TGD')) IS NULL, 'TGĐ không có cấp trên');

-- Bổ nhiệm hợp đồng (ADR #29).
SELECT test.throws($$SELECT test.assign('TDX', 'a', 'P_HD_KT_GD', 'CONTRACT', tstzrange(now(), NULL), 'HD-01')$$,
                   '%assignment_contract_fields%', 'Hợp đồng phải có ngày kết thúc');
SELECT test.throws($$SELECT test.assign('TDX', 'a', 'P_HD_KT_GD', 'CONTRACT', tstzrange(now(), now() + interval '6 months'))$$,
                   '%assignment_contract_fields%', 'Hợp đồng phải có số hợp đồng');
SELECT test.unit('TDX', 'GD_BH', 'GD', 'PHONG', 'Phòng Bảo hành');
SELECT test.position('TDX', 'P_TP_X', 'GD_BH', 'Trưởng phòng Bảo hành (trống)', true);
SELECT test.throws($$SELECT test.assign('TDX', 'e', 'P_TP_X', 'CONTRACT',
                                         tstzrange(now(), now() + interval '6 months'), 'HD-02')$$,
                   '%không được giữ vị trí trưởng%', 'Hợp đồng không giữ vị trí trưởng');
SELECT test.position('TDX', 'P_KHONG_BC', 'GD_KT', 'Ghế không báo cáo cho ai');
SELECT test.throws($$SELECT test.assign('TDX', 'e', 'P_KHONG_BC', 'CONTRACT', tstzrange(now(), now() + interval '6 months'), 'HD-03')$$,
                   '%báo cáo cho người quản lý hợp đồng%', 'Ghế hợp đồng phải báo cáo cho người quản lý hợp đồng');
SELECT test.position('TDX', 'P_HD_KD_CHIP', 'CHIP_KD', 'Ghế hợp đồng ở Chip X', false, 'P_TP_KD_CHIP');
SELECT test.throws($$SELECT test.assign('TDX', 'a', 'P_HD_KD_CHIP', 'CONTRACT', tstzrange(now(), now() + interval '6 months'), 'HD-04')$$,
                   '%công ty khác công ty giữ chính%', 'Hợp đồng không ở cùng công ty giữ chính');
-- Anh A giữ chính ở Chip X, làm hợp đồng ngoài giờ cho Gia dụng X: hợp lệ.
SELECT test.assign('TDX', 'a', 'P_HD_KT_GD', 'CONTRACT', tstzrange(now(), now() + interval '6 months'), 'HD-05');

-- Một tài khoản cho nhiều tenant cùng công ty mẹ (ADR #30).
SELECT test.person('BVX', 'a_bv', 'Anh A ở Bệnh viện X', 'a');
SELECT test.eq((SELECT count(*) FROM core.account_tenants('a')), 2::bigint, 'Tài khoản a vào được TDX và BVX');
SELECT test.throws($$SELECT test.person('CTY', 'a_y', 'Anh A ở Công ty Y', 'a')$$,
                   '%không cùng công ty mẹ%', 'Tenant ngoài tập đoàn phải dùng tài khoản riêng');
