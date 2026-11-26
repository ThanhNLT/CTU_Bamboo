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

-- Hạn mức dung lượng cho mỗi tài khoản (ADR #88): ngoài hạn mức của cả đơn vị (migration 018, mặc định 10 GB), mỗi
-- người chỉ được giữ tối đa `user_storage_quota_bytes` tệp đính kèm do chính mình tải lên, mặc định 5 GB. Cách tính
-- giống core.storage_used: tệp sạch và tệp đang chờ kiểm dịch trong một giờ gần nhất, không tính tệp đã xóa.

ALTER TABLE core.tenant
    ADD COLUMN user_storage_quota_bytes bigint NOT NULL DEFAULT 5368709120 CHECK (user_storage_quota_bytes > 0);

CREATE FUNCTION core.storage_used_by(p_tenant uuid, p_person uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(size_bytes), 0)::bigint FROM core.attachment
    WHERE tenant_id = p_tenant AND uploaded_by = p_person AND deleted_at IS NULL
      AND (status = 'CLEAN' OR (status = 'PENDING' AND created_at > now() - interval '1 hour'))
$$;
