-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Mô-đun ngoài do bên thứ ba viết, nối qua cổng API (ADR #58). Đăng ký = cài trên máy (core.module_install), bật cho
-- công ty như mô-đun dựng sẵn (core.tenant_module). Mã bắt đầu bằng x_ để không trùng mô-đun dựng sẵn sau này.

CREATE TABLE core.external_module (
    module         text PRIMARY KEY REFERENCES core.module_install ON DELETE CASCADE
                   CHECK (module ~ '^x_[a-z0-9_]{2,30}$'),
    name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    description    text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
    vendor         text CHECK (length(vendor) <= 120),
    version        text CHECK (length(version) <= 40),
    base_url       text NOT NULL CHECK (base_url ~ '^https?://[^/?#]+(/[^?#]*)?$'),
    entry_path     text NOT NULL DEFAULT '/' CHECK (entry_path ~ '^/'),
    health_path    text CHECK (health_path ~ '^/'),
    depends        text[] NOT NULL DEFAULT '{}',
    scopes         text[] NOT NULL DEFAULT '{}'
                   CHECK (scopes <@ ARRAY['org.read', 'people.read', 'notify.send']),
    menu           jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(menu) = 'array'),
    -- khóa bí mật của mô-đun = HMAC(ACTIONS_SECRET, mã mô-đun + muối), không lưu; mô-đun gọi /ext-api bằng khóa này
    -- và dùng nó kiểm chữ ký các yêu cầu Bamboo chuyển tới. Đổi muối là đổi khóa
    key_salt       bytea NOT NULL CHECK (length(key_salt) = 16),
    key_sha256     bytea NOT NULL UNIQUE CHECK (length(key_sha256) = 32),
    registered_at  timestamptz NOT NULL DEFAULT now(),
    registered_by  text
);

-- Mô-đun ngoài gửi thông báo cho người trong công ty (phạm vi notify.send)
ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION', 'SECURITY', 'EXTERNAL'));
