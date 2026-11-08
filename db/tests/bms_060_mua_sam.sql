SELECT test.fixture();

SELECT test.pr('pr1', 'c', 'P_NV_MH_DT', 0, false);
SELECT test.pr('pr2', 'c', 'P_NV_MH_DT', 0, false);
SELECT test.ok((SELECT doc_no FROM proc.purchase_request WHERE id = test.id('pr1'))
               ~ '^PR-\d{4}-000001$', 'Đề nghị đầu tiên của tenant có số 000001');
SELECT test.ok((SELECT doc_no FROM proc.purchase_request WHERE id = test.id('pr2'))
               ~ '^PR-\d{4}-000002$', 'Đề nghị tiếp theo tăng số');
SELECT test.eq(core.next_doc_no(test.id('BVX'), 'PR', '2026-12-31 23:00+07'), 'PR-2026-000001',
               'Mỗi tenant một dãy số');
SELECT test.eq(core.next_doc_no(test.id('BVX'), 'PR', '2026-12-31 18:00+00'), 'PR-2027-000001',
               'Năm tính theo giờ Việt Nam');

INSERT INTO mdm.item (tenant_id, code, name, uom, category_code, ref_price)
VALUES (test.id('TDX'), 'VT001', 'Tụ điện 10uF', 'cái', 'LINH_KIEN', 1500);
SELECT test.put('vt1', id) FROM mdm.item WHERE code = 'VT001';
INSERT INTO mdm.partner (tenant_id, code, name, internal_unit_id) VALUES (test.id('TDX'), 'NB_CHIP', 'Công ty Chip X', test.id('CHIP'));
SELECT test.throws($$INSERT INTO mdm.partner (tenant_id, code, name, internal_unit_id)
                     VALUES (test.id('TDX'), 'NB_PHONG', 'Phòng', test.id('CHIP_KD'))$$,
                   '%phải trỏ tới một công ty%', 'Đối tác nội bộ phải là công ty');

INSERT INTO proc.purchase_request_item (request_id, item_id, quantity, unit_price)
VALUES (test.id('pr1'), test.id('vt1'), 1000, 1500);
INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
VALUES (test.id('pr1'), 'Phí vận chuyển', 'chuyến', 1, 500000);
SELECT test.eq((SELECT array_agg(line_no || ':' || description || ':' || uom ORDER BY line_no)
                FROM proc.purchase_request_item WHERE request_id = test.id('pr1')),
               ARRAY['1:Tụ điện 10uF:cái', '2:Phí vận chuyển:chuyến'], 'Tự điền số dòng, mô tả, đơn vị tính');
SELECT test.eq((SELECT total_amount FROM proc.purchase_request WHERE id = test.id('pr1')), 2000000.00,
               'Tổng tiền bằng tổng các dòng');
SELECT test.eq((SELECT tenant_id FROM proc.purchase_request_item WHERE request_id = test.id('pr1') LIMIT 1),
               test.id('TDX'), 'Dòng hàng lấy tenant của đề nghị');

UPDATE proc.purchase_request_item SET quantity = 2000 WHERE request_id = test.id('pr1') AND line_no = 1;
SELECT test.eq((SELECT total_amount FROM proc.purchase_request WHERE id = test.id('pr1')), 3500000.00,
               'Sửa số lượng thì tính lại tổng');
UPDATE proc.purchase_request SET total_amount = 1 WHERE id = test.id('pr1');
SELECT test.eq((SELECT total_amount FROM proc.purchase_request WHERE id = test.id('pr1')), 3500000.00,
               'Có dòng hàng thì không sửa tay tổng tiền');
DELETE FROM proc.purchase_request_item WHERE request_id = test.id('pr1') AND line_no = 2;
SELECT test.eq((SELECT total_amount FROM proc.purchase_request WHERE id = test.id('pr1')), 3000000.00,
               'Xóa dòng thì tính lại tổng');

SELECT proc.submit_purchase_request(test.id('pr1'), test.id('c'));
SELECT test.throws($$UPDATE proc.purchase_request_item SET quantity = 1 WHERE request_id = test.id('pr1')$$,
                   '%trạng thái PENDING%', 'Đang chờ duyệt thì không sửa dòng hàng');
SELECT test.throws($$INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
                     VALUES (test.id('pr1'), 'Thêm', 'cái', 1, 1)$$,
                   '%trạng thái PENDING%', 'Đang chờ duyệt thì không thêm dòng hàng');
SELECT wf.act((test.open_task('pr1')).id, test.id('tp_mh_dt'), 'RETURN', 'Bổ sung báo giá');
UPDATE proc.purchase_request_item SET unit_price = 1000 WHERE request_id = test.id('pr1');
SELECT test.eq((SELECT total_amount FROM proc.purchase_request WHERE id = test.id('pr1')), 2000000.00,
               'Bị trả về thì sửa được dòng hàng');

INSERT INTO proc.purchase_request_item (request_id, description, uom, quantity, unit_price)
VALUES (test.id('pr2'), 'Giấy A4', 'ram', 10, 80000);
DELETE FROM proc.purchase_request WHERE id = test.id('pr2');
SELECT test.eq((SELECT count(*) FROM proc.purchase_request_item WHERE request_id = test.id('pr2')), 0::bigint,
               'Xóa nháp thì xóa dòng hàng');

SELECT test.pr('pr3', 'c', 'P_NV_MH_DT', 20000000);
SELECT test.throws($$SELECT proc.cancel_purchase_request(test.id('pr3'), test.id('d'), 'x')$$,
                   '%Chỉ người lập%', 'Người khác không hủy được');
SELECT test.throws($$SELECT proc.cancel_purchase_request(test.id('pr3'), test.id('c'), ' ')$$,
                   '%lý do%', 'Hủy phải ghi lý do');
SELECT proc.cancel_purchase_request(test.id('pr3'), test.id('c'), 'Không còn nhu cầu');
SELECT test.eq(test.status('pr3'), 'CANCELLED', 'Đề nghị bị hủy');
SELECT test.ok(test.open_task('pr3') IS NULL, 'Không còn việc duyệt mở');
SELECT test.eq((SELECT person_id FROM wf.approval_history
                WHERE entity_id = test.id('pr3') AND event = 'CANCELLED'), test.id('c'), 'Lịch sử ghi người hủy');
SELECT test.throws($$SELECT proc.cancel_purchase_request(test.id('pr3'), test.id('c'), 'lại')$$,
                   '%không hủy được%', 'Đã hủy thì không hủy lại');
