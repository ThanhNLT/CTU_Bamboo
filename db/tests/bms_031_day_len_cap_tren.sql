-- Tìm người duyệt khi đến bước: quyền trưởng, đẩy lên cấp trên, gộp bước,
-- hợp đồng không duyệt, chặn xung đột giao dịch nội bộ (ADR #28, #29).
SELECT test.fixture();

-- Vị trí trống, không có quyền trưởng: đẩy lên trưởng đơn vị cấp trên.
SELECT test.end_assignment('tp_mh_dt', 'P_TP_MH_DT');
SELECT test.pr('pr_trong', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq((SELECT test.key(position_id) FROM wf.approval_step WHERE entity_id = test.id('pr_trong')),
               'P_TP_MH_DT', 'Chuỗi vẫn chốt vào vị trí trưởng phòng');
SELECT test.eq(test.assignee('pr_trong'), 'gd_dt', 'Vị trí trống thì giám đốc công ty nhận việc');
SELECT test.eq((test.open_task('pr_trong')).escalation_reason, 'VACANT', 'Lý do đẩy lên: vị trí trống');
SELECT test.ok(EXISTS (SELECT 1 FROM wf.approval_history WHERE entity_id = test.id('pr_trong') AND event = 'ESCALATED'),
               'Lịch sử ghi việc đẩy lên');

-- Quyền trưởng vào ghế trống: nhận việc mới.
SELECT test.assign('TDX', 'e', 'P_TP_MH_DT', 'ACTING', tstzrange(now(), now() + interval '3 months'));
SELECT test.pr('pr_quyen', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq(test.assignee('pr_quyen'), 'e', 'Người làm quyền trưởng nhận việc');
-- Việc đã đẩy lên trước đó ở lại cấp trên, không kéo về.
SELECT test.eq(test.assignee('pr_trong'), 'gd_dt', 'Việc đã đẩy lên vẫn ở giám đốc công ty');

-- Gộp bước: giám đốc Chip X trống nên bước 1 lên TGĐ; bước 2 cũng là TGĐ.
SELECT test.end_assignment('gd_chip', 'P_GD_CHIP');
SELECT test.pr('pr_gop', 'a', 'P_NV_KD_CHIP', 600000000);
SELECT test.eq(test.assignee('pr_gop'), 'tgd', 'Bước 1 đẩy lên TGĐ');
SELECT test.approve('pr_gop', 'tgd');
SELECT test.eq(test.status('pr_gop'), 'APPROVED', 'TGĐ duyệt một lần là xong cả hai bước');
SELECT test.eq((SELECT array_agg(status ORDER BY step_order) FROM wf.approval_step WHERE entity_id = test.id('pr_gop')),
               ARRAY['APPROVED', 'APPROVED'], 'Hai bước đều đã duyệt');
SELECT test.ok(EXISTS (SELECT 1 FROM wf.approval_history WHERE entity_id = test.id('pr_gop') AND event = 'MERGED'),
               'Lịch sử ghi việc gộp');

-- Có giám đốc mới: việc đã đẩy lên TGĐ không kéo về giám đốc mới.
SELECT test.pr('pr_100_chip', 'a', 'P_NV_KD_CHIP', 100000000);
SELECT test.eq(test.assignee('pr_100_chip'), 'tgd', 'Giám đốc Chip X trống: 100 triệu lên TGĐ');
SELECT test.person('TDX', 'gd_chip2', 'Giám đốc Chip X mới');
SELECT test.assign('TDX', 'gd_chip2', 'P_GD_CHIP', 'PRIMARY', tstzrange(now(), NULL));
SELECT test.eq(test.assignee('pr_100_chip'), 'tgd', 'Việc đã đẩy lên ở lại TGĐ');
SELECT test.pr('pr_100_chip_moi', 'a', 'P_NV_KD_CHIP', 100000000);
SELECT test.eq(test.assignee('pr_100_chip_moi'), 'gd_chip2', 'Đề nghị mới đến giám đốc mới');

-- Bổ nhiệm hợp đồng: anh A giữ chính ở Chip X, làm hợp đồng cho Gia dụng X.
SELECT test.assign('TDX', 'a', 'P_HD_KT_GD', 'CONTRACT', tstzrange(now(), now() + interval '6 months'), 'HD-01');
-- Đề nghị anh A lập ở Gia dụng X do người quản lý hợp đồng duyệt.
SELECT test.pr('pr_hd', 'a', 'P_HD_KT_GD', 30000000);
SELECT test.eq((SELECT test.key(org_unit_id) FROM proc.purchase_request WHERE id = test.id('pr_hd')),
               'GD_KT', 'Đề nghị thuộc đơn vị của tư cách lập');
SELECT test.eq(test.assignee('pr_hd'), 'tp_kt_gd', 'Người quản lý hợp đồng duyệt');
-- Người làm hợp đồng không bao giờ là người duyệt, kể cả khi có người báo cáo cho ghế đó.
SELECT test.position('TDX', 'P_TRO_LY_GD', 'GD_KT', 'Trợ lý kỹ thuật', false, 'P_HD_KT_GD');
SELECT test.person('TDX', 'f', 'Chị F');
SELECT test.assign('TDX', 'f', 'P_TRO_LY_GD');
SELECT test.pr('pr_f', 'f', 'P_TRO_LY_GD', 10000000);
SELECT test.eq(test.assignee('pr_f'), 'tp_kt_gd', 'Không giao việc cho người làm hợp đồng');
SELECT test.eq((test.open_task('pr_f')).escalation_reason, 'CONTRACT', 'Lý do đẩy lên: hợp đồng');

-- Xung đột giao dịch nội bộ: anh A lập đơn bán ở Chip X và kiêm nhiệm trưởng
-- phòng mua hàng ở Điện thoại X (ghế đang do chị E làm quyền trưởng → đổi sang A).
DELETE FROM core.assignment WHERE person_id = test.id('e') AND position_id = test.id('P_TP_MH_DT');
SELECT test.assign('TDX', 'a', 'P_TP_MH_DT', 'CONCURRENT', tstzrange(now(), NULL));
INSERT INTO ic.ic_order (tenant_id, seller_unit_id, buyer_unit_id, created_by, total_amount)
VALUES (test.id('TDX'), test.id('CHIP'), test.id('DT'), test.id('a'), 30000000);
INSERT INTO test.ids SELECT 'ic1', id FROM ic.ic_order;
SELECT test.pr('pr_ic', 'c', 'P_NV_MH_DT', 30000000, true, test.id('ic1'));
SELECT test.eq(test.assignee('pr_ic'), 'gd_dt', 'Anh A đứng bên bán nên quản lý của ghế phía bên mua duyệt');
SELECT test.eq((test.open_task('pr_ic')).escalation_reason, 'CONFLICT', 'Lý do đẩy lên: xung đột giao dịch nội bộ');
SELECT test.pr('pr_khong_ic', 'c', 'P_NV_MH_DT', 30000000);
SELECT test.eq(test.assignee('pr_khong_ic'), 'a', 'Đề nghị không gắn giao dịch nội bộ thì anh A duyệt bình thường');
