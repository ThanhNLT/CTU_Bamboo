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

-- Vai trò ứng dụng (bamboo_actions) không có quyền TEMPORARY trên CSDL như máy chủ thật (roles.sql thu hồi khỏi PUBLIC)
-- vẫn tạo được công ty, thêm đơn vị, bổ nhiệm người (trigger đồng bộ kênh chat không dùng bảng tạm, migration 061)
-- và cấp đủ quyền cho công ty mới (migration 060).

DO $$
BEGIN
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;

SET LOCAL ROLE bamboo_actions;
DO $$
DECLARE
    v_t uuid;
    v_root uuid;
    v_gd uuid;
    v_unit uuid;
    v_pos uuid;
BEGIN
    SELECT tenant_id, root_unit_id, director_position_id INTO v_t, v_root, v_gd
    FROM core.create_tenant('VTUD', 'Công ty vai trò ứng dụng');
    PERFORM core.provision_tenant(v_t);
    PERFORM core.place_person(v_t, 'sub-vtud-gd', 'Giám đốc', 'VTUD-0001', v_gd);
    INSERT INTO core.org_unit (tenant_id, parent_id, unit_type_id, code, name)
    VALUES (v_t, v_root, (SELECT id FROM core.catalog_item WHERE tenant_id = v_t AND catalog = 'UNIT_TYPE' AND code = 'PHONG'),
            'VTUD_KD', 'Phòng Kinh doanh')
    RETURNING id INTO v_unit;
    INSERT INTO core.position (tenant_id, org_unit_id, name, is_head) VALUES (v_t, v_unit, 'Trưởng phòng', true)
    RETURNING id INTO v_pos;
    PERFORM core.place_person(v_t, 'sub-vtud-tp', 'Trưởng phòng', 'VTUD-0002', v_pos);
END $$;
RESET ROLE;

SELECT test.eq((SELECT count(*)::int FROM chat.conversation c JOIN core.tenant t ON t.id = c.tenant_id
                WHERE t.code = 'VTUD' AND c.kind = 'UNIT'), 2, 'mỗi đơn vị có kênh chat');
SELECT test.eq((SELECT count(*)::int FROM chat.member m JOIN chat.conversation c ON c.id = m.conversation_id
                JOIN core.tenant t ON t.id = c.tenant_id WHERE t.code = 'VTUD' AND m.left_at IS NULL), 3,
               'giám đốc ở kênh công ty, trưởng phòng ở kênh công ty và kênh phòng');
SELECT test.eq((SELECT count(*)::int FROM core.role_permission rp JOIN core.role r ON r.id = rp.role_id
                JOIN core.tenant t ON t.id = r.tenant_id WHERE t.code = 'VTUD' AND r.code = 'QUAN_TRI_TO_CHUC'),
               (SELECT count(*)::int FROM core.permission), 'quản trị công ty mới có mọi quyền');
SELECT test.eq((SELECT string_agg(process_code, ',' ORDER BY process_code) FROM wf.approval_rule ar
                JOIN core.tenant t ON t.id = ar.tenant_id WHERE t.code = 'VTUD'),
               'KB_DOCUMENT,ONBOARDING,PURCHASE_REQUEST', 'đủ quy tắc duyệt mặc định');
