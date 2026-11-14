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

-- chat.sync_units (055) dùng bảng tạm, nhưng vai trò ứng dụng (bamboo_actions, bamboo_hasura) không có quyền
-- TEMPORARY trên CSDL (db/roles/roles.sql thu hồi khỏi PUBLIC). Trigger đồng bộ kênh chat chạy khi đổi đơn vị, phân
-- công nên mọi thao tác của ứng dụng lên cơ cấu tổ chức (tạo công ty khi đăng ký, thêm đơn vị, bổ nhiệm, điều chuyển)
-- báo "permission denied to create temporary tables"; seed chạy bằng chủ CSDL nên không gặp. Viết lại bằng CTE
-- MATERIALIZED: vẫn tính danh sách thành viên một lần, không cần bảng tạm.

CREATE OR REPLACE FUNCTION chat.sync_units(p_tenant uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO chat.conversation (tenant_id, kind, org_unit_id)
    SELECT u.tenant_id, 'UNIT', u.id FROM core.org_unit u
    WHERE u.tenant_id = p_tenant AND u.valid_period @> now()
      AND NOT EXISTS (SELECT FROM chat.conversation c WHERE c.tenant_id = u.tenant_id AND c.org_unit_id = u.id);

    WITH should AS MATERIALIZED (
        SELECT DISTINCT conversation_id, person_id FROM chat.unit_members(p_tenant)
    ),
    joined AS (
        INSERT INTO chat.member (tenant_id, conversation_id, person_id, source)
        SELECT p_tenant, s.conversation_id, s.person_id, 'UNIT' FROM should s
        WHERE NOT EXISTS (SELECT FROM chat.member m WHERE m.conversation_id = s.conversation_id
                                                    AND m.person_id = s.person_id AND m.left_at IS NULL)
        ON CONFLICT (conversation_id, person_id) DO UPDATE SET left_at = NULL, joined_at = now()
        RETURNING 1
    )
    UPDATE chat.member m SET left_at = now()
    FROM chat.conversation c
    WHERE c.id = m.conversation_id AND c.tenant_id = p_tenant AND c.kind = 'UNIT' AND m.left_at IS NULL
      AND NOT EXISTS (SELECT FROM should s WHERE s.conversation_id = m.conversation_id AND s.person_id = m.person_id);
END $$;
