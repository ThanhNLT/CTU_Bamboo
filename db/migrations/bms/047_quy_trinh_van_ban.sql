-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Quy trình ⇄ văn bản quy định trong thư viện tri thức. Hai chiều dùng chung một bảng liên kết:
--   SOURCE      văn bản đã hiệu lực mà từ đó dựng bản nháp sơ đồ (Action process_from_document);
--   REGULATION  văn bản quy định lập từ một phiên bản đã phát hành của sơ đồ (Action process_regulation_draft). Văn bản
--               đi theo chuỗi duyệt tài liệu (KB_DOCUMENT); duyệt xong là quy định đang hiệu lực của công ty và thay thế
--               bản quy định của phiên bản trước (collab.kb_publish).
-- Phiên bản quy trình bất biến (audit.append_only) nên liên kết nằm ở bảng riêng, không thêm cột vào wf.process_version.
CREATE TABLE wf.process_regulation (
    tenant_id       uuid NOT NULL REFERENCES core.tenant,
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        uuid NOT NULL,
    version         int,
    kb_document_id  uuid NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('SOURCE', 'REGULATION')),
    created_by      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'REGULATION') = (version IS NOT NULL)),
    FOREIGN KEY (tenant_id, model_id) REFERENCES wf.process_model (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (model_id, version) REFERENCES wf.process_version (model_id, version) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, kb_document_id) REFERENCES collab.kb_document (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id)
);
CREATE UNIQUE INDEX process_regulation_one_per_document ON wf.process_regulation (model_id, kb_document_id, kind);
CREATE UNIQUE INDEX process_regulation_one_document_per_version ON wf.process_regulation (kb_document_id)
    WHERE kind = 'REGULATION';
CREATE INDEX ON wf.process_regulation (model_id, kind);
CALL audit.enable('wf.process_regulation');
