-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Chủ sở hữu: cảnh báo đăng nhập từ thiết bị mới, khôi phục tài khoản bằng ký số, chuyển quyền chủ sở hữu (ADR #57)

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION', 'SECURITY'));

ALTER TABLE core.setup_application DROP CONSTRAINT setup_application_purpose_check,
    ADD CHECK (purpose IN ('SETUP', 'VERIFY', 'RECOVER'));
ALTER TABLE core.setup_application DROP CONSTRAINT setup_application_check,
    ADD CHECK ((purpose = 'SETUP') = (tenant_id IS NULL) OR finished_at IS NOT NULL);

-- Thiết bị đã đăng nhập của chủ sở hữu và người có quyền quản trị (công ty có chủ sở hữu). Thiết bị = trình duyệt và
-- dải địa chỉ mạng (IPv4 /24, IPv6 /48), lưu dạng băm cùng mô tả để hiện trong cảnh báo
CREATE TABLE core.login_device (
    tenant_id     uuid NOT NULL REFERENCES core.tenant,
    person_id     uuid NOT NULL,
    device_hash   bytea NOT NULL CHECK (length(device_hash) = 32),
    user_agent    text,
    ip            text,
    first_seen    timestamptz NOT NULL DEFAULT now(),
    last_seen     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (person_id, device_hash),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id)
);

CREATE FUNCTION core.person_is_admin(p_tenant uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT FROM core.v_permission_grant
                   WHERE tenant_id = p_tenant AND person_id = p_person
                     AND permission_code = ANY (core.admin_permissions()) AND valid_period @> now())
$$;

-- Ghi nhận một lần đăng nhập (webhook xác thực gọi mỗi token một lần); thiết bị mới thì báo chủ sở hữu.
-- Trả true khi là thiết bị mới đã được báo
CREATE FUNCTION core.record_login(p_tenant uuid, p_person uuid, p_device bytea, p_user_agent text, p_ip text)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
    v_owner uuid;
    v_name text;
    v_inserted boolean;
BEGIN
    SELECT person_id INTO v_owner FROM core.tenant_owner WHERE tenant_id = p_tenant;
    IF v_owner IS NULL OR (p_person <> v_owner AND NOT core.person_is_admin(p_tenant, p_person)) THEN
        RETURN false;
    END IF;
    INSERT INTO core.login_device (tenant_id, person_id, device_hash, user_agent, ip)
    VALUES (p_tenant, p_person, p_device, left(p_user_agent, 300), left(p_ip, 60))
    ON CONFLICT (person_id, device_hash) DO UPDATE SET last_seen = now()
    RETURNING (xmax = 0) INTO v_inserted;
    IF NOT v_inserted THEN
        RETURN false;
    END IF;
    SELECT full_name INTO v_name FROM core.person WHERE id = p_person;
    PERFORM collab.notify(
        p_tenant, v_owner, 'SECURITY', 'core.tenant', p_tenant,
        CASE WHEN p_person = v_owner THEN 'Tài khoản chủ sở hữu đăng nhập từ thiết bị mới'
             ELSE format('Quản trị viên %s đăng nhập từ thiết bị mới', v_name) END,
        format('Trình duyệt: %s. Địa chỉ mạng: %s. Lúc %s. Nếu không phải người này, thu hồi quyền quản trị và đổi mật khẩu ngay.',
               coalesce(left(p_user_agent, 160), 'không rõ'), coalesce(p_ip, 'không rõ'),
               to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')));
    RETURN true;
END $$;

-- Báo mọi chủ sở hữu và người có quyền quản trị của công ty về một sự kiện bảo mật
CREATE FUNCTION core.notify_security(p_tenant uuid, p_title text, p_body text, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql AS $$
    SELECT collab.notify(p_tenant, x.person_id, 'SECURITY', 'core.tenant', p_tenant, p_title, p_body, p_actor)
    FROM (SELECT person_id FROM core.tenant_owner WHERE tenant_id = p_tenant
          UNION
          SELECT DISTINCT person_id FROM core.v_permission_grant
          WHERE tenant_id = p_tenant AND permission_code = ANY (core.admin_permissions()) AND valid_period @> now()) x
$$;
