-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();

INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('TDX'), 'muaSam', 'Mua sắm', '<definitions/>', test.id('c'))
RETURNING test.put('m', id);
SELECT test.throws($$INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
                     VALUES (test.id('TDX'), 'muaSam', 'Trùng', '<x/>', test.id('c'))$$,
                   '%duplicate key%', 'Mã quy trình duy nhất trong tenant');
INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
VALUES (test.id('BVX'), 'muaSam', 'Tenant khác dùng cùng mã', '<definitions/>', test.id('c'));
SELECT test.throws($$INSERT INTO wf.process_model (tenant_id, process_key, name, bpmn_xml, created_by)
                     VALUES (test.id('TDX'), '1 sai', 'Sai mã', '<x/>', test.id('c'))$$,
                   '%violates check%', 'Mã quy trình dạng NCName');

INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by)
VALUES (test.id('TDX'), test.id('m'), 1, '<definitions/>', '[]', 'x', test.id('c'));
SELECT test.throws($$UPDATE wf.process_version SET note = 'sửa' WHERE model_id = test.id('m')$$,
                   '%chỉ cho ghi thêm%', 'Phiên bản phát hành không sửa được');
SELECT test.throws($$INSERT INTO wf.process_version (tenant_id, model_id, version, bpmn_xml, forms, sha256, published_by)
                     VALUES (test.id('TDX'), test.id('m'), 1, '<x/>', '[]', 'y', test.id('c'))$$,
                   '%duplicate key%', 'Mỗi số phiên bản một lần');
SELECT test.ok(EXISTS (SELECT 1 FROM audit.log WHERE table_name = 'wf.process_model' AND row_id = test.id('m')::text),
               'Bản nháp có nhật ký kiểm toán');
SELECT test.ok(EXISTS (SELECT 1 FROM core.permission WHERE code = 'wf.process.design'), 'Có quyền wf.process.design');
