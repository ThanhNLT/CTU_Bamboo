-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
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

-- Công ty tạo qua trang đăng ký (ADR #62) hoặc công ty thành viên (create_subsidiary) dùng được ngay mọi công cụ đã
-- bật: vai trò dựng sẵn có đủ quyền của các mô-đun (core.create_tenant chỉ cấp quyền mua sắm, duyệt; các mã quyền thêm
-- sau ở 013–058 chỉ được seed cấp cho công ty demo) và có quy tắc duyệt mặc định cho mọi quy trình cần chuỗi duyệt.
-- Hàm chạy lại không đổi gì (idempotent); dữ liệu demo không gọi hàm này nên giữ nguyên phân quyền theo kịch bản.

CREATE FUNCTION core.provision_tenant(p_tenant uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('NHAN_VIEN', ARRAY['proc.purchase_request.create', 'proc.purchase_request.read', 'kb.document.create']),
        ('QUAN_LY', ARRAY['proc.purchase_request.create', 'proc.purchase_request.read', 'wf.approval.act',
                          'hr.onboarding.read', 'hr.onboarding.create', 'hr.transfer.read', 'hr.transfer.create',
                          'hr.decision.read', 'ic.order.read', 'ic.order.confirm', 'kb.document.create',
                          'pm.project.read', 'pm.project.manage', 'cal.unit.manage', 'ops.group.read']),
        ('KIEM_SOAT', ARRAY['proc.purchase_request.read', 'audit.read', 'ops.group.read', 'data.lakehouse.read',
                            'hr.decision.read', 'hr.onboarding.read', 'ic.order.read', 'pm.project.read']),
        ('QUAN_TRI_TO_CHUC', (SELECT array_agg(code ORDER BY code) FROM core.permission))
    ) v(code, perms) LOOP
        INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
        SELECT p_tenant, ro.id, p.code
        FROM core.role ro JOIN core.permission p ON p.code = ANY (r.perms)
        WHERE ro.tenant_id = p_tenant AND ro.code = r.code
        ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order)
    SELECT p_tenant, v.code, 0, 1
    FROM (VALUES ('PURCHASE_REQUEST'), ('ONBOARDING'), ('KB_DOCUMENT')) v(code)
    WHERE NOT EXISTS (SELECT FROM wf.approval_rule ar
                      WHERE ar.tenant_id = p_tenant AND ar.process_code = v.code AND ar.valid_period @> now());
END $$;

COMMENT ON FUNCTION core.provision_tenant(uuid) IS
    'Quyền đủ cho vai trò dựng sẵn và quy tắc duyệt mặc định của công ty tạo qua đăng ký hoặc công ty thành viên';

-- Công ty đã tạo qua đăng ký và công ty thành viên của chúng.
SELECT core.provision_tenant(t.id)
FROM core.tenant t
WHERE t.id IN (SELECT tenant_id FROM core.setup_application WHERE purpose = 'SETUP' AND tenant_id IS NOT NULL)
   OR t.id IN (SELECT r.child_tenant_id FROM core.tenant_relation r
               JOIN core.setup_application a ON a.tenant_id = r.parent_tenant_id AND a.purpose = 'SETUP');
