-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();

-- CSDL trống lúc chạy migration: chưa mô-đun nào được cài
SELECT test.eq((SELECT count(*)::int FROM core.module_install), 0, 'hệ thống mới chỉ có phần lõi');

-- Không bật được mô-đun chưa cài trên máy
SELECT test.throws($$INSERT INTO core.tenant_module (tenant_id, module) VALUES (test.id('TDX'), 'procurement')$$,
                   '%tenant_module_module_fkey%', 'mô-đun chưa cài thì không bật được');

INSERT INTO core.module_install (module) VALUES ('approval'), ('procurement');
INSERT INTO core.tenant_module (tenant_id, module) VALUES (test.id('TDX'), 'approval'), (test.id('TDX'), 'procurement');
SELECT test.ok(core.module_enabled(test.id('TDX'), 'procurement'), 'đã bật cho TDX');
SELECT test.ok(NOT core.module_enabled(test.id('TDX'), 'hr'), 'chưa bật hr');

-- Còn công ty bật thì không gỡ được khỏi máy
SELECT test.throws($$DELETE FROM core.module_install WHERE module = 'procurement'$$,
                   '%tenant_module_module_fkey%', 'không gỡ mô-đun đang bật');

-- Mã mô-đun đúng mẫu
SELECT test.throws($$INSERT INTO core.module_install (module) VALUES ('Mua Sam')$$, '%module_install_module_check%',
                   'mã mô-đun chữ thường không dấu');

-- Bật/tắt mô-đun ghi nhật ký kiểm toán
DELETE FROM core.tenant_module WHERE tenant_id = test.id('TDX') AND module = 'procurement';
SELECT test.ok(EXISTS (SELECT FROM audit.log WHERE table_name = 'core.tenant_module' AND op = 'DELETE'),
               'tắt mô-đun có nhật ký');
SELECT test.ok(NOT core.module_enabled(test.id('TDX'), 'procurement'), 'đã tắt');

-- Quyền quản lý mô-đun có trong danh mục quyền
SELECT test.ok(EXISTS (SELECT FROM core.permission WHERE code = 'core.module.manage'), 'có quyền core.module.manage');
