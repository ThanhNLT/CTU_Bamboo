# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Nạp dữ liệu demo Tập đoàn X (ADR #16): chạy sau `migrate`, bỏ qua nếu đã có, tắt bằng SEED_DEMO=false.

Đề nghị mua sắm mẫu (kèm dòng hàng) đi qua đúng các hàm CSDL (gửi duyệt, duyệt, trả về) nên dừng ở
đúng bước của chuỗi duyệt; flow-sync tự tạo tiến trình Flowable tương ứng.
"""

# ===== Thư viện chuẩn =====
import json
import logging
import os
import pathlib
import sys

# ===== Thư viện bên ngoài =====
import psycopg  # psycopg
from faker import Faker  # Faker

# ===== Module nội bộ =====
from .demo import (
    CONTRACT_SEATS,
    DEMO_USERS,
    HR_DEMO_USERS,
    HR_SCOPE,
    HR_UNITS,
    OPEN_SEATS,
    TENANTS,
    TREES,
    UNIT_TYPES,
    VACANT,
    uid,
    walk,
)

# ===== Hằng số & cấu hình =====
log = logging.getLogger("seed")
START = "2025-01-01T00:00:00+07:00"
# Quy trình mẫu cho trang Thiết kế quy trình (image Python chép thư mục platform vào /repo/platform).
BPMN_SAMPLE = pathlib.Path(__file__).resolve().parents[3] / "platform/flowable/purchase_request.bpmn20.xml"

# Nhóm hàng (danh mục ITEM_CATEGORY, khớp wf.approval_rule.category_code).
ITEM_CATEGORIES = {
    "TDX": {
        "LINH_KIEN": "Linh kiện điện tử",
        "THIET_BI": "Thiết bị, máy móc",
        "CNTT": "Thiết bị CNTT",
        "VAN_PHONG": "Văn phòng phẩm",
        "DICH_VU": "Dịch vụ",
    },
    "BVX": {"TBYT": "Thiết bị y tế", "VAT_TU_YT": "Vật tư y tế", "VAN_PHONG": "Văn phòng phẩm"},
}

# Nhà cung cấp: (tenant, mã, tên, mã đơn vị nội bộ). Tên hư cấu (ADR #19).
PARTNERS = [
    ("TDX", "NB_CHIP", "Công ty Chip X", "CHIP"),
    ("TDX", "NB_DT", "Công ty Điện thoại X", "DT"),
    ("TDX", "NB_GD", "Công ty Gia dụng X", "GD"),
    ("TDX", "NCC_KTA", "Công ty TNHH Thiết bị Kỹ thuật A", None),
    ("TDX", "NCC_MCB", "Công ty CP Máy chủ B", None),
    ("TDX", "NCC_VPC", "Công ty TNHH Văn phòng phẩm C", None),
    ("TDX", "NCC_DVD", "Công ty CP Dịch vụ Cơ điện D", None),
    ("BVX", "NCC_YTE", "Công ty CP Thiết bị Y tế E", None),
]

# Vật tư: (tenant, mã, tên, đơn vị tính, nhóm hàng, giá tham khảo).
ITEMS = [
    ("TDX", "LK-PMIC", "Chip quản lý nguồn PMIC", "cái", "LINH_KIEN", 12_000),
    ("TDX", "LK-SOC-MAU", "SoC mẫu thử kỹ thuật", "cái", "LINH_KIEN", 300_000),
    ("TDX", "LK-BOMACH", "Bo mạch thử nghiệm", "cái", "LINH_KIEN", 500_000),
    ("TDX", "TB-DEMHAT", "Máy đếm hạt bụi phòng sạch", "bộ", "THIET_BI", 35_000_000),
    ("TDX", "TB-DUNGCU", "Bộ dụng cụ sửa chữa điện tử", "bộ", "THIET_BI", 3_000_000),
    ("TDX", "TB-DONGHO", "Đồng hồ vạn năng", "cái", "THIET_BI", 3_000_000),
    ("TDX", "CNTT-MAYCHU", "Máy chủ 2U 64 nhân", "cái", "CNTT", 150_000_000),
    ("TDX", "VPP-GIAY", "Giấy A4", "ram", "VAN_PHONG", 80_000),
    ("TDX", "VPP-MUC", "Mực in laser", "hộp", "VAN_PHONG", 400_000),
    ("TDX", "DV-VC", "Vận chuyển hàng nhanh", "chuyến", "DICH_VU", None),
    ("TDX", "DV-HVAC", "Bảo trì hệ thống điều hòa phòng sạch", "lần", "DICH_VU", None),
    ("BVX", "TBYT-SIEUAM", "Máy siêu âm 4D", "máy", "TBYT", 200_000_000),
]

# (tenant, ghế người lập, tiêu đề, nhóm hàng, nhà cung cấp, dòng hàng: (mã vật tư, số lượng, đơn giá),
#  các bước đã xử lý: (quyết định, ghế người xử lý, ghi chú))
PURCHASE_REQUESTS = [
    (
        "TDX",
        "DT_MH.S1",
        "Linh kiện thay thế cho lô điện thoại bị ảnh hưởng",
        None,
        "NB_CHIP",
        [("LK-PMIC", 50_000, 12_000), ("DV-VC", 1, 50_000_000)],
        [("APPROVE", "DT.HEAD", None)],
    ),  # 650 tr: chờ TGĐ
    (
        "TDX",
        "CHIP_PS.S1",
        "Máy đếm hạt bụi phòng sạch",
        None,
        "NCC_KTA",
        [("TB-DEMHAT", 1, 35_000_000)],
        [],
    ),  # chờ quản đốc phòng sạch
    (
        "TDX",
        "CHIP_KD.S2",
        "Mẫu thử cho khách hàng B2B",
        None,
        None,
        [("LK-SOC-MAU", 300, 300_000)],
        [],
    ),  # chờ giám đốc Chip X (đang ủy quyền)
    (
        "TDX",
        "GD_KTHT.S1",
        "Bộ dụng cụ sửa chữa cho đội kỹ thuật",
        None,
        "NCC_KTA",
        [("TB-DUNGCU", 40, 3_000_000)],
        [],
    ),  # chờ giám đốc Gia dụng X
    (
        "TDX",
        "CHIP_RD_KC.S1",
        "Bo mạch thử nghiệm cho kiểm chứng",
        None,
        None,
        [("LK-BOMACH", 50, 500_000)],
        [],
    ),  # trưởng phòng trống: lên giám đốc R&D
    (
        "TDX",
        "GD_BH.HD1",
        "Thiết bị đo cho tư vấn bảo hành",
        None,
        None,
        [("TB-DONGHO", 5, 3_000_000)],
        [],
    ),  # người làm hợp đồng lập
    (
        "TDX",
        "TDX_CDS.S2",
        "Máy chủ cho nền tảng DX-OS",
        None,
        "NCC_MCB",
        [("CNTT-MAYCHU", 2, 150_000_000)],
        [],
    ),  # công ty mẹ: lên TGĐ
    (
        "TDX",
        "DT_MH.S1",
        "Văn phòng phẩm quý IV",
        None,
        "NCC_VPC",
        [("VPP-GIAY", 50, 80_000), ("VPP-MUC", 10, 400_000)],
        [("RETURN", "DT_MH.HEAD", "Tách riêng mực in, bổ sung báo giá thứ hai")],
    ),
    (
        "TDX",
        "CHIP_PS.S2",
        "Bảo trì hệ thống điều hòa phòng sạch",
        None,
        "NCC_DVD",
        [("DV-HVAC", 1, 45_000_000)],
        [("APPROVE", "CHIP_PS.HEAD", None)],
    ),  # đã duyệt
    (
        "BVX",
        "BVX_CDHA.S1",
        "Máy siêu âm 4D",
        "TBYT",
        "NCC_YTE",
        [("TBYT-SIEUAM", 1, 200_000_000)],
        [],
    ),  # thiết bị y tế: 2 cấp
]

# Đơn hàng nội bộ (ADR #42). Lô của Chip X: (mã lô, vật tư, đơn vị sản xuất, số lượng, ngày sản xuất, trạng thái).
LOTS = [
    ("PMIC-2609-A", "LK-PMIC", "CHIP_PX", 200_000, "2026-09-12", "RELEASED"),
    ("PMIC-2609-B", "LK-PMIC", "CHIP_PX", 150_000, "2026-09-19", "RELEASED"),
    ("SOC-2609-A", "LK-SOC-MAU", "CHIP_PS", 2_000, "2026-09-15", "RELEASED"),
]
# Lô gần đây cho bảng Sản xuất của Trung tâm điều hành (ADR #49): (số lô, vật tư, đơn vị, số lượng, cách hôm nay
# bao nhiêu ngày, trạng thái, ghi chú). Ngày tính lúc nạp nên lần đầu cài luôn có số liệu trong kỳ.
RECENT_LOTS = [
    ("PMIC-R-01", "LK-PMIC", "CHIP_PX", 180_000, 20, "RELEASED", None),
    ("PMIC-R-02", "LK-PMIC", "CHIP_PX", 160_000, 12, "RELEASED", None),
    ("PMIC-R-03", "LK-PMIC", "CHIP_PX", 90_000, 6, "ON_HOLD", "Chờ kết quả kiểm tra điện áp ngưỡng"),
    ("SOC-R-01", "LK-SOC-MAU", "CHIP_PS", 1_500, 9, "RELEASED", None),
    ("SOC-R-02", "LK-SOC-MAU", "CHIP_PS", 800, 3, "SCRAPPED", "Lỗi quang khắc lớp kim loại 2"),
]
# Vị trí cơ sở (tỉnh, vĩ độ, kinh độ) của các công ty để hiện trên bản đồ điều hành.
SITES = {
    "TDX": [
        ("DT", "Thái Nguyên", 21.59422, 105.84817),
        ("CHIP", "Bắc Ninh", 21.18612, 106.07631),
        ("GD", "Hải Dương", 20.93734, 106.31455),
    ],
    "BVX": [("BVX", "Hà Nội", 20.97136, 105.77876)],
}
# Khối kinh doanh xác nhận đơn hàng nội bộ bán ra từ công ty mình: đơn vị → công ty.
SALES_SCOPE = {"CHIP_KD": "CHIP", "DT_KD": "DT", "GD_PP": "GD"}
# Đơn đã giao xong: Điện thoại X mua PMIC của Chip X (lô PMIC-2609-A), trưởng phòng mua hàng duyệt, kinh doanh
# Chip X xác nhận. Bước 3 kịch bản demo truy xuất lô chip đã giao cho điện thoại từ đây.
IC_DEMO = (
    "TDX",
    "DT_MH.S2",
    "PMIC cho lô lắp ráp tháng 10",
    "NB_CHIP",
    [("LK-PMIC", 1_500, 12_000)],
    "DT_MH.HEAD",
    "CHIP_KD.S1",
    "PMIC-2609-A",
)

# Bình luận mẫu: (tiêu đề đề nghị, ghế người viết, nội dung).
COMMENTS = [
    (
        "Văn phòng phẩm quý IV",
        "DT_MH.S1",
        "Em sẽ tách mực in sang đề nghị riêng và bổ sung báo giá của nhà cung cấp thứ hai.",
    ),
    (
        "Linh kiện thay thế cho lô điện thoại bị ảnh hưởng",
        "DT.HEAD",
        "Đã duyệt cấp công ty. Đề nghị Tổng giám đốc xem xét sớm để kịp thay linh kiện cho lô bị ảnh hưởng.",
    ),
]


# ===== Lớp =====
class Seeder:
    def __init__(self, conn: psycopg.Connection, faker_seed: int = 2026):
        self.conn = conn
        self.fake = Faker("vi_VN")
        self.fake.seed_instance(faker_seed)
        self.unit_types: dict[tuple[str, str], object] = {}
        self.titles: dict[tuple[str, str], object] = {}
        self.positions: dict[tuple[str, str], object] = {}  # (tenant, khóa ghế) -> id
        self.holders: dict[tuple[str, str], object] = {}  # (tenant, khóa ghế) -> person id
        self.codes: dict[str, int] = {}

    def x(self, sql: str, *args):
        return self.conn.execute(sql, args)

    def tenant_id(self, code: str):
        return uid("tenant", code)

    # ===== Tổ chức =====

    def title(self, tenant: str, name: str):
        key = (tenant, name)
        if key not in self.titles:
            self.titles[key] = uid(tenant, "JOB_TITLE", name)
            self.x(
                """INSERT INTO core.catalog_item (tenant_id, id, catalog, code, name)
                      VALUES (%s, %s, 'JOB_TITLE', %s, %s)""",
                self.tenant_id(tenant),
                self.titles[key],
                f"CT{len(self.titles):03d}",
                name,
            )
        return self.titles[key]

    def position(self, tenant, key, unit_code, name, head=False, reports_to=None):
        pid = uid(tenant, "position", key)
        self.x(
            """INSERT INTO core.position (tenant_id, id, org_unit_id, job_title_id, name, is_head, reports_to_id, valid_period)
                  VALUES (%s, %s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
            self.tenant_id(tenant),
            pid,
            uid(tenant, "unit", unit_code),
            self.title(tenant, name),
            name,
            head,
            self.positions.get((tenant, reports_to)) if reports_to else None,
            START,
        )
        self.positions[(tenant, key)] = pid

    def org(self, tenant: str):
        tid = self.tenant_id(tenant)
        for code, name in UNIT_TYPES.items():
            self.unit_types[(tenant, code)] = uid(tenant, "UNIT_TYPE", code)
            self.x(
                "INSERT INTO core.catalog_item (tenant_id, id, catalog, code, name) VALUES (%s, %s, 'UNIT_TYPE', %s, %s)",
                tid,
                self.unit_types[(tenant, code)],
                code,
                name,
            )
        for unit, parent in walk(TREES[tenant]):
            self.x(
                """INSERT INTO core.org_unit (tenant_id, id, parent_id, unit_type_id, code, name, is_legal_entity, valid_period)
                      VALUES (%s, %s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                tid,
                uid(tenant, "unit", unit.code),
                uid(tenant, "unit", parent.code) if parent else None,
                self.unit_types[(tenant, unit.type)],
                unit.code,
                unit.name,
                unit.legal,
                START,
            )
            head = f"{unit.code}.HEAD"
            self.position(tenant, head, unit.code, unit.head, head=True)
            for i, deputy in enumerate(unit.deputies, 1):
                self.position(tenant, f"{unit.code}.DEP{i}", unit.code, deputy, reports_to=head)
            for i in range(1, unit.staff + 1):
                self.position(tenant, f"{unit.code}.S{i}", unit.code, unit.staff_title)
        for t, key, unit_code, name, reports_to in CONTRACT_SEATS:
            if t == tenant:
                self.position(tenant, key, unit_code, name, reports_to=reports_to)

    # ===== Người và bổ nhiệm =====

    def person(self, tenant: str, full_name: str, person_id=None, subject=None):
        self.codes[tenant] = self.codes.get(tenant, 0) + 1
        person_id = person_id or uid(tenant, "person", str(self.codes[tenant]))
        self.x(
            """INSERT INTO core.person (tenant_id, id, idp_subject, full_name, employee_code)
                  VALUES (%s, %s, %s, %s, %s)""",
            self.tenant_id(tenant),
            person_id,
            subject,
            full_name,
            f"{tenant}-{self.codes[tenant]:04d}",
        )
        return person_id

    def assign(self, tenant, person_id, seat, kind="PRIMARY"):
        if kind == "CONTRACT":
            period, contract = "tstzrange(now() - interval '3 months', now() + interval '6 months')", "HĐ-2026-017"
        else:
            period, contract = f"tstzrange('{START}', NULL)", None
        self.x(
            f"""INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period, contract_no)
                   VALUES (%s, %s, %s, %s, {period}, %s)""",
            self.tenant_id(tenant),
            person_id,
            self.positions[(tenant, seat)],
            kind,
            contract,
        )
        self.holders.setdefault((tenant, seat), person_id)

    def fake_name(self) -> str:
        first = self.fake.first_name_male() if self.fake.boolean() else self.fake.first_name_female()
        return f"{self.fake.last_name()} {self.fake.middle_name()} {first}"

    def people(self):
        for user in DEMO_USERS:
            persons = {}
            for seat in user.seats:
                if seat.tenant not in persons:
                    first = not persons
                    persons[seat.tenant] = self.person(
                        seat.tenant,
                        user.full_name,
                        person_id=user.id if first else uid(seat.tenant, "person", user.username),
                        subject=str(user.id),
                    )
                self.assign(seat.tenant, persons[seat.tenant], seat.position, seat.type)
        for tenant, seat in self.positions:
            if (tenant, seat) in self.holders or (tenant, seat) in VACANT or ".HD" in seat:
                continue
            self.assign(tenant, self.person(tenant, self.fake_name()), seat)

    # ===== Phân quyền, hạn mức, ủy quyền =====

    def roles(self, tenant: str):
        tid = self.tenant_id(tenant)
        roles = {
            "NHAN_VIEN": ("Nhân viên", ["proc.purchase_request.create", "proc.purchase_request.read"]),
            "QUAN_LY": ("Quản lý", ["proc.purchase_request.read", "wf.approval.act"]),
            "KIEM_SOAT": ("Kiểm soát tài chính", ["proc.purchase_request.read", "audit.read"]),
            "QUAN_TRI_TO_CHUC": ("Quản trị tổ chức", ["core.org.manage", "core.permission.manage"]),
        }
        for code, (name, perms) in roles.items():
            rid = uid(tenant, "role", code)
            self.x("INSERT INTO core.role (tenant_id, id, code, name) VALUES (%s, %s, %s, %s)", tid, rid, code, name)
            for perm in perms:
                self.x(
                    "INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (%s, %s, %s)",
                    tid,
                    rid,
                    perm,
                )

        def grant(role, scope, unit=None, position=None):
            self.x(
                """INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, position_id, scope, valid_period)
                      VALUES (%s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                tid,
                uid(tenant, "role", role),
                unit,
                position,
                scope,
                START,
            )

        for unit, _ in walk(TREES[tenant]):
            grant("NHAN_VIEN", "UNIT", unit=uid(tenant, "unit", unit.code))
            grant("QUAN_LY", "SUBTREE", position=self.positions[(tenant, f"{unit.code}.HEAD")])
        control = {"TDX": ["TDX_TC.HEAD", "TDX_PC.HEAD"], "BVX": ["BVX_TC.HEAD"]}[tenant]
        for seat in control:
            grant("KIEM_SOAT", "TENANT", position=self.positions[(tenant, seat)])
        admins = {"TDX": ["TDX_NS.HEAD", "TDX_CDS.HEAD"], "BVX": ["BVX_KHTH.HEAD"]}[tenant]
        for seat in admins:
            grant("QUAN_TRI_TO_CHUC", "TENANT", position=self.positions[(tenant, seat)])

    def approval_rules(self):
        rules = []
        tdx, bvx = self.tenant_id("TDX"), self.tenant_id("BVX")
        # Hạn mức chung của Tập đoàn X: < 50 tr quản lý trực tiếp; 50–500 tr giám đốc công ty; >= 500 tr thêm TGĐ.
        rules += [
            (tdx, 0, 50e6, 1, None, None, None),
            (tdx, 50e6, 500e6, 1, "CONG_TY", None, None),
            (tdx, 500e6, None, 1, "CONG_TY", None, None),
            (tdx, 500e6, None, 2, "TAP_DOAN", None, None),
        ]
        # Các khối của công ty mẹ không thuộc công ty con nào: từ 50 tr lên thẳng TGĐ.
        for unit in TREES["TDX"].children:
            if unit.type != "CONG_TY":
                rules += [(tdx, 0, 50e6, 1, None, unit.code, None), (tdx, 50e6, None, 1, "TAP_DOAN", unit.code, None)]
        # Bệnh viện X: < 50 tr quản lý trực tiếp, từ 50 tr giám đốc bệnh viện; thiết bị y tế luôn duyệt 2 cấp.
        rules += [
            (bvx, 0, 50e6, 1, None, None, None),
            (bvx, 50e6, None, 1, "BENH_VIEN", None, None),
            (bvx, 0, None, 1, None, None, "TBYT"),
            (bvx, 0, None, 2, "BENH_VIEN", None, "TBYT"),
        ]
        for tid, lo, hi, step, unit_type, scope, category in rules:
            tenant = "TDX" if tid == tdx else "BVX"
            self.x(
                """INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, max_amount, step_order,
                                                    approver_unit_type_id, scope_unit_id, category_code, valid_period)
                      VALUES (%s, 'PURCHASE_REQUEST', %s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                tid,
                lo,
                hi,
                step,
                self.unit_types[(tenant, unit_type)] if unit_type else None,
                uid(tenant, "unit", scope) if scope else None,
                category,
                START,
            )

    def delegation(self):
        # Giám đốc Chip X đi công tác, ủy quyền cho phó giám đốc (duyệt thay).
        self.x(
            """INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period, reason)
                  VALUES (%s, %s, %s, %s, tstzrange(now() - interval '1 day', now() + interval '60 days'),
                          'Đi công tác Hàn Quốc')""",
            self.tenant_id("TDX"),
            self.holders[("TDX", "CHIP.HEAD")],
            self.holders[("TDX", "CHIP.DEP1")],
            self.positions[("TDX", "CHIP.HEAD")],
        )

    def master_data(self, tenant: str):
        tid = self.tenant_id(tenant)
        for code, name in ITEM_CATEGORIES[tenant].items():
            self.x(
                """INSERT INTO core.catalog_item (tenant_id, id, catalog, code, name)
                      VALUES (%s, %s, 'ITEM_CATEGORY', %s, %s)""",
                tid,
                uid(tenant, "ITEM_CATEGORY", code),
                code,
                name,
            )
        for t, code, name, unit in PARTNERS:
            if t == tenant:
                self.x(
                    """INSERT INTO mdm.partner (tenant_id, id, code, name, internal_unit_id)
                          VALUES (%s, %s, %s, %s, %s)""",
                    tid,
                    uid(tenant, "partner", code),
                    code,
                    name,
                    uid(tenant, "unit", unit) if unit else None,
                )
        for t, code, name, uom, category, price in ITEMS:
            if t == tenant:
                self.x(
                    """INSERT INTO mdm.item (tenant_id, id, code, name, uom, category_code, ref_price)
                          VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    tid,
                    uid(tenant, "item", code),
                    code,
                    name,
                    uom,
                    category,
                    price,
                )

    def purchase_requests(self):
        ids = {}
        for tenant, seat, title, category, partner, lines, steps in PURCHASE_REQUESTS:
            requester = self.holders[(tenant, seat)]
            pr_id = self.x(
                """INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id,
                                                                 category_code, partner_id)
                              VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                self.tenant_id(tenant),
                title,
                requester,
                self.positions[(tenant, seat)],
                category,
                uid(tenant, "partner", partner) if partner else None,
            ).fetchone()[0]
            for item, quantity, price in lines:
                self.x(
                    """INSERT INTO proc.purchase_request_item (request_id, item_id, quantity, unit_price)
                          VALUES (%s, %s, %s, %s)""",
                    pr_id,
                    uid(tenant, "item", item),
                    quantity,
                    price,
                )
            self.x("SELECT proc.submit_purchase_request(%s, %s)", pr_id, requester)
            for decision, actor_seat, note in steps:
                task = self.x(
                    """SELECT t.id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                                 WHERE s.entity_id = %s AND t.status = 'OPEN'""",
                    pr_id,
                ).fetchone()[0]
                self.x("SELECT wf.act(%s, %s, %s, %s)", task, self.holders[(tenant, actor_seat)], decision, note)
            ids[title] = (tenant, pr_id)
        for title, seat, body in COMMENTS:
            tenant, pr_id = ids[title]
            self.x(
                """INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
                      VALUES (%s, 'proc.purchase_request', %s, %s, %s)""",
                self.tenant_id(tenant),
                pr_id,
                self.holders[(tenant, seat)],
                body,
            )

    # ===== Nhân sự (ADR #41): chạy cả ở bản đã cài, bỏ qua phần đã có =====

    def _next_code(self, tenant: str) -> int:
        """Số mã nhân viên tiếp theo dạng <tenant>-NNNN (đọc từ CSDL khi bổ sung vào bản đã cài)."""
        if tenant not in self.codes:
            self.codes[tenant] = self.x(
                """SELECT coalesce(max(substring(employee_code FROM '-(\\d+)$')::int), 0) FROM core.person
                   WHERE tenant_id = %s AND employee_code ~ '^[A-Z]+-\\d+$'""",
                self.tenant_id(tenant),
            ).fetchone()[0]
        return self.codes[tenant]

    def _seat(self, tenant, key, unit_code, name, head=False):
        pid = uid(tenant, "position", key)
        if not self.x("SELECT 1 FROM core.position WHERE id = %s", pid).fetchone():
            title = self.x(
                """SELECT id FROM core.catalog_item WHERE tenant_id = %s AND catalog = 'JOB_TITLE' AND name = %s""",
                self.tenant_id(tenant),
                name,
            ).fetchone()
            title_id = title[0] if title else uid(tenant, "JOB_TITLE", name)
            if not title:
                last = self.x(
                    """SELECT coalesce(max(substring(code FROM 3)::int), 0) FROM core.catalog_item
                                 WHERE tenant_id = %s AND catalog = 'JOB_TITLE' AND code ~ '^CT\\d+$'""",
                    self.tenant_id(tenant),
                ).fetchone()[0]
                self.x(
                    """INSERT INTO core.catalog_item (tenant_id, id, catalog, code, name)
                          VALUES (%s, %s, 'JOB_TITLE', %s, %s)""",
                    self.tenant_id(tenant),
                    title_id,
                    f"CT{last + 1:03d}",
                    name,
                )
            self.x(
                """INSERT INTO core.position (tenant_id, id, org_unit_id, job_title_id, name, is_head, valid_period)
                      VALUES (%s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                self.tenant_id(tenant),
                pid,
                uid(tenant, "unit", unit_code),
                title_id,
                name,
                head,
                START,
            )
        self.positions[(tenant, key)] = pid
        return pid

    def _hr_person(self, tenant, seat, full_name, person_id=None, subject=None):
        pid = self.positions[(tenant, seat)]
        if self.x("SELECT 1 FROM core.position_holder(%s)", pid).fetchone():
            return
        person_id = person_id or uid(tenant, "person", "hr", seat)
        if not self.x("SELECT 1 FROM core.person WHERE id = %s", person_id).fetchone():
            self.codes[tenant] = self._next_code(tenant) + 1
            self.x(
                """INSERT INTO core.person (tenant_id, id, idp_subject, full_name, employee_code)
                      VALUES (%s, %s, %s, %s, %s)""",
                self.tenant_id(tenant),
                person_id,
                subject,
                full_name,
                f"{tenant}-{self.codes[tenant]:04d}",
            )
        self.x(
            """INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
                  VALUES (%s, %s, %s, 'PRIMARY', tstzrange(%s, NULL))""",
            self.tenant_id(tenant),
            person_id,
            pid,
            START,
        )
        self.holders.setdefault((tenant, seat), person_id)

    def hr_demo(self):
        """Phòng nhân sự từng công ty, chuyên viên nhân sự demo, ghế tuyển mới, vai trò NHAN_SU và quy tắc duyệt
        ONBOARDING (trưởng đơn vị nhận người rồi giám đốc công ty). Chạy lại không tạo trùng."""
        fake = Faker("vi_VN")
        fake.seed_instance(4141)
        for tenant, code, name, parent, type_, head, staff, staff_title in HR_UNITS:
            tid = self.tenant_id(tenant)
            if not self.x("SELECT 1 FROM core.org_unit WHERE tenant_id = %s AND code = %s", tid, code).fetchone():
                self.x(
                    """INSERT INTO core.org_unit (tenant_id, id, parent_id, unit_type_id, code, name, valid_period)
                          VALUES (%s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                    tid,
                    uid(tenant, "unit", code),
                    uid(tenant, "unit", parent),
                    uid(tenant, "UNIT_TYPE", type_),
                    code,
                    name,
                    START,
                )
            self._seat(tenant, f"{code}.HEAD", code, head, head=True)
            for i in range(1, staff + 1):
                self._seat(tenant, f"{code}.S{i}", code, staff_title)
        for tenant, key, unit_code, title in OPEN_SEATS:
            self._seat(tenant, key, unit_code, title)

        for user in HR_DEMO_USERS:
            seat = user.seats[0]
            self._hr_person(seat.tenant, seat.position, user.full_name, person_id=user.id, subject=str(user.id))
        for tenant, code, _name, _parent, _type, _head, staff, _title in HR_UNITS:
            for key in [f"{code}.HEAD", *(f"{code}.S{i}" for i in range(1, staff + 1))]:
                first = fake.first_name_male() if fake.boolean() else fake.first_name_female()
                self._hr_person(tenant, key, f"{fake.last_name()} {fake.middle_name()} {first}")

        for t in TENANTS:
            tid = self.tenant_id(t.code)
            role = uid(t.code, "role", "NHAN_SU")
            if not self.x("SELECT 1 FROM core.role WHERE id = %s", role).fetchone():
                self.x(
                    "INSERT INTO core.role (tenant_id, id, code, name) VALUES (%s, %s, 'NHAN_SU', 'Nhân sự')", tid, role
                )
            for perm in ("hr.onboarding.create", "hr.onboarding.read", "hr.onboarding.private.read"):
                self.x(
                    """INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (%s, %s, %s)
                          ON CONFLICT DO NOTHING""",
                    tid,
                    role,
                    perm,
                )
            self.x(
                """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
                      SELECT tenant_id, id, 'hr.onboarding.read' FROM core.role WHERE id = %s
                      ON CONFLICT DO NOTHING""",
                uid(t.code, "role", "QUAN_LY"),
            )
            for unit, scope in HR_SCOPE.items():
                unit_id = uid(t.code, "unit", unit)
                if not self.x("SELECT 1 FROM core.org_unit WHERE id = %s AND tenant_id = %s", unit_id, tid).fetchone():
                    continue
                if not self.x(
                    "SELECT 1 FROM core.role_grant WHERE role_id = %s AND org_unit_id = %s", role, unit_id
                ).fetchone():
                    self.x(
                        """INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope, scope_unit_id, valid_period)
                              VALUES (%s, %s, %s, 'SUBTREE', %s, tstzrange(%s, NULL))""",
                        tid,
                        role,
                        unit_id,
                        uid(t.code, "unit", scope),
                        START,
                    )

        if not self.x("SELECT 1 FROM wf.approval_rule WHERE process_code = 'ONBOARDING'").fetchone():
            tdx, bvx = self.tenant_id("TDX"), self.tenant_id("BVX")
            rules = [(tdx, 1, None, None), (tdx, 2, "CONG_TY", None), (bvx, 1, None, None), (bvx, 2, "BENH_VIEN", None)]
            # Các khối của công ty mẹ: bước 2 là Tổng giám đốc.
            for unit in TREES["TDX"].children:
                if unit.type != "CONG_TY":
                    rules += [(tdx, 1, None, unit.code), (tdx, 2, "TAP_DOAN", unit.code)]
            for tid, step, unit_type, scope in rules:
                tenant = "TDX" if tid == tdx else "BVX"
                self.x(
                    """INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order,
                                                        approver_unit_type_id, scope_unit_id, valid_period)
                          VALUES (%s, 'ONBOARDING', 0, %s, %s, %s, tstzrange(%s, NULL))""",
                    tid,
                    step,
                    uid(tenant, "UNIT_TYPE", unit_type) if unit_type else None,
                    uid(tenant, "unit", scope) if scope else None,
                    START,
                )

    # ===== Đơn hàng nội bộ (ADR #42): chạy cả ở bản đã cài, bỏ qua phần đã có =====

    def _holder(self, tenant: str, seat: str):
        return self.x("SELECT person_id FROM core.position_holder(%s)", uid(tenant, "position", seat)).fetchone()[0]

    def ic_demo(self):
        """Lô của Chip X, vai trò BAN_HANG_NOI_BO cho khối kinh doanh từng công ty, một đơn nội bộ đã xác nhận."""
        tdx = self.tenant_id("TDX")
        for lot_no, item, unit, quantity, produced, status in LOTS:
            self.x(
                """INSERT INTO mfg.lot (tenant_id, id, lot_no, item_id, org_unit_id, quantity, uom, produced_on, status)
                      SELECT %s, %s, %s, i.id, %s, %s, i.uom, %s, %s FROM mdm.item i WHERE i.id = %s
                      ON CONFLICT DO NOTHING""",
                tdx,
                uid("TDX", "lot", lot_no),
                lot_no,
                uid("TDX", "unit", unit),
                quantity,
                produced,
                status,
                uid("TDX", "item", item),
            )

        for t in TENANTS:
            tid = self.tenant_id(t.code)
            role = uid(t.code, "role", "BAN_HANG_NOI_BO")
            if not self.x("SELECT 1 FROM core.role WHERE id = %s", role).fetchone():
                self.x(
                    """INSERT INTO core.role (tenant_id, id, code, name)
                          VALUES (%s, %s, 'BAN_HANG_NOI_BO', 'Bán hàng nội bộ')""",
                    tid,
                    role,
                )
            for perm in ("ic.order.read", "ic.order.confirm"):
                self.x(
                    """INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (%s, %s, %s)
                          ON CONFLICT DO NOTHING""",
                    tid,
                    role,
                    perm,
                )
            # Quản lý xem đơn bán ra từ cây đơn vị mình (giám đốc công ty bán).
            self.x(
                """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
                      SELECT tenant_id, id, 'ic.order.read' FROM core.role WHERE id = %s
                      ON CONFLICT DO NOTHING""",
                uid(t.code, "role", "QUAN_LY"),
            )
            for unit, scope in SALES_SCOPE.items():
                unit_id = uid(t.code, "unit", unit)
                if not self.x("SELECT 1 FROM core.org_unit WHERE id = %s AND tenant_id = %s", unit_id, tid).fetchone():
                    continue
                if not self.x(
                    "SELECT 1 FROM core.role_grant WHERE role_id = %s AND org_unit_id = %s", role, unit_id
                ).fetchone():
                    self.x(
                        """INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, scope, scope_unit_id, valid_period)
                              VALUES (%s, %s, %s, 'SUBTREE', %s, tstzrange(%s, NULL))""",
                        tid,
                        role,
                        unit_id,
                        uid(t.code, "unit", scope),
                        START,
                    )

        tenant, seat, title, partner, lines, approver, confirmer, lot_no = IC_DEMO
        if self.x("SELECT 1 FROM proc.purchase_request WHERE tenant_id = %s AND title = %s", tdx, title).fetchone():
            return
        requester = self._holder(tenant, seat)
        pr_id = self.x(
            """INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id, partner_id)
                          VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            tdx,
            title,
            requester,
            uid(tenant, "position", seat),
            uid(tenant, "partner", partner),
        ).fetchone()[0]
        for item, quantity, price in lines:
            self.x(
                """INSERT INTO proc.purchase_request_item (request_id, item_id, quantity, unit_price)
                      VALUES (%s, %s, %s, %s)""",
                pr_id,
                uid(tenant, "item", item),
                quantity,
                price,
            )
        self.x("SELECT proc.submit_purchase_request(%s, %s)", pr_id, requester)
        task = self.x(
            """SELECT t.id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                         WHERE s.entity_id = %s AND t.status = 'OPEN'""",
            pr_id,
        ).fetchone()[0]
        self.x("SELECT wf.act(%s, %s, 'APPROVE')", task, self._holder(tenant, approver))
        order_id, lot_lines = self.x(
            """SELECT o.id, jsonb_object_agg(i.id, %s::text)
                                        FROM proc.purchase_request r JOIN ic.ic_order o ON o.id = r.ic_order_id
                                        JOIN ic.ic_order_item i ON i.order_id = o.id
                                        WHERE r.id = %s GROUP BY o.id""",
            str(uid("TDX", "lot", lot_no)),
            pr_id,
        ).fetchone()
        self.x("SELECT ic.confirm_order(%s, %s, %s)", order_id, self._holder(tenant, confirmer), json.dumps(lot_lines))

    def seat_role(self, code: str, name: str, permission: str, seats: dict[str, list[str]]):
        """Vai trò một quyền gán cho các ghế, phạm vi cả tenant. Chạy lại không trùng."""
        for t in TENANTS:
            tid = self.tenant_id(t.code)
            role = uid(t.code, "role", code)
            if not self.x("SELECT 1 FROM core.role WHERE id = %s", role).fetchone():
                self.x(
                    "INSERT INTO core.role (tenant_id, id, code, name) VALUES (%s, %s, %s, %s)", tid, role, code, name
                )
            self.x(
                """INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
                      VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                tid,
                role,
                permission,
            )
            for seat in seats.get(t.code, []):
                position = uid(t.code, "position", seat)
                if not self.x(
                    "SELECT 1 FROM core.role_grant WHERE role_id = %s AND position_id = %s", role, position
                ).fetchone():
                    self.x(
                        """INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope, valid_period)
                              VALUES (%s, %s, %s, 'TENANT', tstzrange(%s, NULL))""",
                        tid,
                        role,
                        position,
                        START,
                    )

    # ===== Dữ liệu Lakehouse (ADR #45), dữ liệu chủ: chạy cả ở bản đã cài, bỏ qua phần đã có =====

    def lakehouse_demo(self):
        """Vai trò PHAN_TICH_DU_LIEU (xem tập dữ liệu Lakehouse) cho CDO của Tập đoàn X và Kế hoạch tổng hợp BVX."""
        self.seat_role(
            "PHAN_TICH_DU_LIEU",
            "Phân tích dữ liệu",
            "data.lakehouse.read",
            {"TDX": ["TDX_CDS.HEAD"], "BVX": ["BVX_KHTH.HEAD"]},
        )

    def master_data_admin_demo(self):
        """Vai trò QUAN_LY_DU_LIEU_CHU (danh mục nhà cung cấp, vật tư; thêm nhà cung cấp người lập đề xuất)."""
        self.seat_role(
            "QUAN_LY_DU_LIEU_CHU",
            "Quản lý dữ liệu chủ",
            "mdm.manage",
            {"TDX": ["TDX_CDS.HEAD"], "BVX": ["BVX_KHTH.HEAD"]},
        )

    def process_design_demo(self):
        """Vai trò THIET_KE_QUY_TRINH (wf.process.design) và quy trình mẫu Duyệt đề nghị mua sắm (ADR #47)."""
        seats = {"TDX": ["TDX_CDS.HEAD"], "BVX": ["BVX_KHTH.HEAD"]}
        self.seat_role("THIET_KE_QUY_TRINH", "Thiết kế quy trình", "wf.process.design", seats)
        if not BPMN_SAMPLE.exists():
            return
        xml = BPMN_SAMPLE.read_text(encoding="utf-8")
        forms = [
            {
                "key": "duyet_de_nghi",
                "name": "Duyệt đề nghị – mặc định",
                "fields": [
                    {"label": "Quyết định", "type": "Danh mục", "required": True},
                    {"label": "Ý kiến", "type": "Đoạn văn", "required": False},
                ],
            }
        ]
        for t in TENANTS:
            seat = seats.get(t.code, [None])[0]
            owner = (
                self.x(
                    """SELECT person_id FROM core.assignment
                       WHERE position_id = %s AND upper_inf(valid_period) LIMIT 1""",
                    uid(t.code, "position", seat),
                ).fetchone()
                if seat
                else None
            )
            if owner is None:
                continue
            self.x(
                """INSERT INTO wf.process_model (tenant_id, id, process_key, name, description, bpmn_xml, forms,
                                                 created_by, updated_by)
                   VALUES (%s, %s, 'purchaseRequestApproval', 'Duyệt đề nghị mua sắm',
                           'Bản phản chiếu luồng duyệt đề nghị mua sắm (ADR #31)', %s, %s::jsonb, %s, %s)
                   ON CONFLICT (tenant_id, process_key) DO NOTHING""",
                self.tenant_id(t.code),
                uid(t.code, "process_model", "purchaseRequestApproval"),
                xml,
                json.dumps(forms, ensure_ascii=False),
                owner[0],
                owner[0],
            )

    def ops_demo(self):
        """Trung tâm điều hành (ADR #49): vai trò xem số liệu tổng hợp của tenant con, tọa độ cơ sở, lô gần đây.
        Chạy lại không tạo trùng, không ghi đè tọa độ đã sửa."""
        self.seat_role(
            "DIEU_HANH_TAP_DOAN",
            "Điều hành tập đoàn",
            "ops.group.read",
            {"TDX": ["TDX.HEAD", "TDX_CDS.HEAD"], "BVX": ["BVX.HEAD", "BVX_KHTH.HEAD"]},
        )
        for code, sites in SITES.items():
            for unit, province, lat, lng in sites:
                self.x(
                    "UPDATE core.org_unit SET province = %s, lat = %s, lng = %s WHERE id = %s AND lat IS NULL",
                    province,
                    lat,
                    lng,
                    uid(code, "unit", unit),
                )
        tdx = self.tenant_id("TDX")
        for lot_no, item, unit, quantity, ago, status, note in RECENT_LOTS:
            self.x(
                """INSERT INTO mfg.lot (tenant_id, id, lot_no, item_id, org_unit_id, quantity, uom, produced_on, status,
                                        note)
                      SELECT %s, %s, %s, i.id, %s, %s, i.uom, current_date - %s, %s, %s FROM mdm.item i WHERE i.id = %s
                      ON CONFLICT DO NOTHING""",
                tdx,
                uid("TDX", "lot", lot_no),
                lot_no,
                uid("TDX", "unit", unit),
                quantity,
                ago,
                status,
                note,
                uid("TDX", "item", item),
            )

    def library_demo(self):
        """Thư viện tri thức (ADR #48): vai trò đề xuất / quản lý, quy tắc duyệt KB_DOCUMENT (trưởng đơn vị của người
        lập), vài tài liệu đã xuất bản. Chạy lại không tạo trùng."""
        self.seat_role(
            "DE_XUAT_TAI_LIEU",
            "Đề xuất tài liệu",
            "kb.document.create",
            {
                "TDX": ["DT_MH.S1", "CHIP_PS.HEAD", "TDX_CDS.HEAD", "TDX_PC.S1"],
                "BVX": ["BVX_KHTH.S1", "BVX_DUOC.HEAD", "BVX_KHTH.HEAD"],
            },
        )
        self.seat_role(
            "QUAN_LY_THU_VIEN",
            "Quản lý thư viện",
            "kb.document.manage",
            {"TDX": ["TDX_CDS.HEAD"], "BVX": ["BVX_KHTH.HEAD"]},
        )
        for t in TENANTS:
            tid = self.tenant_id(t.code)
            if not self.x(
                "SELECT 1 FROM wf.approval_rule WHERE tenant_id = %s AND process_code = 'KB_DOCUMENT'", tid
            ).fetchone():
                self.x(
                    """INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, step_order, valid_period)
                          VALUES (%s, 'KB_DOCUMENT', 0, 1, tstzrange(%s, NULL))""",
                    tid,
                    START,
                )
        docs = [
            (
                "TDX",
                "CHIP_PS.HEAD",
                "Quy chế vận hành phòng sạch",
                "regulation",
                "company",
                "Cấp độ sạch, kiểm soát ra vào, giám sát hạt bụi và xử lý sự cố phòng sạch của nhà máy chip.",
                [
                    "Phạm vi áp dụng và cấp độ sạch",
                    "Kiểm soát ra vào khóa khí",
                    "Giám sát hạt bụi, nhiệt độ, độ ẩm",
                    "Phân cấp sự cố và thời hạn báo cáo",
                ],
            ),
            (
                "TDX",
                "TDX_CDS.HEAD",
                "Quy chế quản lý tài liệu số của Tập đoàn",
                "regulation",
                "group",
                "Nguyên tắc lưu trữ, phân quyền, đối soát toàn vẹn và lưu giữ tài liệu số trên Bamboo.",
                ["Phạm vi và đối tượng", "Phân loại và phân quyền", "Đối soát toàn vẹn (Sổ cái)", "Thời hạn lưu giữ"],
            ),
            (
                "TDX",
                "TDX_CDS.HEAD",
                "Hướng dẫn lập đề nghị mua sắm",
                "guide",
                "group",
                "Các bước lập, đính kèm báo giá, gửi duyệt và theo dõi đề nghị mua sắm.",
                ["Chọn tư cách lập", "Nhà cung cấp và nhóm hàng", "Đính kèm báo giá", "Theo dõi chuỗi duyệt"],
            ),
            (
                "BVX",
                "BVX_KHTH.HEAD",
                "Quy trình kiểm soát nhiễm khuẩn",
                "sop",
                "company",
                "Quy trình chuẩn kiểm soát nhiễm khuẩn tại các khoa lâm sàng.",
                ["Vệ sinh tay", "Phân loại chất thải y tế", "Giám sát và báo cáo"],
            ),
        ]
        for code, seat, title, category, scope, summary, toc in docs:
            tid = self.tenant_id(code)
            doc_id = uid(code, "kb_document", title)
            if self.x("SELECT 1 FROM collab.kb_document WHERE id = %s", doc_id).fetchone():
                continue
            position = uid(code, "position", seat)
            owner = self.x(
                "SELECT person_id FROM core.assignment WHERE position_id = %s AND upper_inf(valid_period) LIMIT 1",
                position,
            ).fetchone()
            if owner is None:
                continue
            self.x(
                """INSERT INTO collab.kb_document (tenant_id, id, title, category, scope, summary, toc, effective_date,
                                                   requester_id, requester_position_id)
                      VALUES (%s, %s, %s, %s, %s, %s, %s, DATE '2026-09-01', %s, %s)""",
                tid,
                doc_id,
                title,
                category,
                scope,
                summary,
                toc,
                owner[0],
                position,
            )
            self.x("UPDATE collab.kb_document SET status = 'APPROVED', published_at = %s WHERE id = %s", START, doc_id)

    def run(self):
        for t in TENANTS:
            self.x(
                "INSERT INTO core.tenant (id, code, name) VALUES (%s, %s, %s)", self.tenant_id(t.code), t.code, t.name
            )
        for t in TENANTS:
            if t.parent:
                self.x(
                    "INSERT INTO core.tenant_relation (parent_tenant_id, child_tenant_id) VALUES (%s, %s)",
                    self.tenant_id(t.parent),
                    self.tenant_id(t.code),
                )
        for t in TENANTS:
            self.org(t.code)
        self.people()
        # Kiểm tra ngay trong giao dịch (trigger chuyển việc mặc định chạy lúc commit).
        self.x("SET CONSTRAINTS ALL IMMEDIATE")
        for t in TENANTS:
            self.roles(t.code)
        for t in TENANTS:
            self.master_data(t.code)
        self.approval_rules()
        self.delegation()
        self.purchase_requests()
        self.hr_demo()
        self.ic_demo()
        self.lakehouse_demo()
        self.master_data_admin_demo()
        self.process_design_demo()
        self.library_demo()
        self.ops_demo()


def seed(conn: psycopg.Connection) -> bool:
    """Nạp dữ liệu demo trong một giao dịch. Trả về False nếu đã có (khi đó chỉ bổ sung phần mới: nhân sự, đơn
    hàng nội bộ, vai trò xem Lakehouse, quản lý dữ liệu chủ, thiết kế quy trình, thư viện, điều hành)."""
    if conn.execute("SELECT 1 FROM core.tenant WHERE code = 'TDX'").fetchone():
        with conn.transaction():
            seeder = Seeder(conn)
            seeder.x("SET CONSTRAINTS ALL IMMEDIATE")
            seeder.hr_demo()
            seeder.ic_demo()
            seeder.lakehouse_demo()
            seeder.master_data_admin_demo()
            seeder.process_design_demo()
            seeder.library_demo()
            seeder.ops_demo()
        return False
    with conn.transaction():
        Seeder(conn).run()
    return True


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    if os.environ.get("SEED_DEMO", "true").lower() == "false":
        log.info("SEED_DEMO=false: bỏ qua")
        return 0
    url = os.environ.get("DATABASE_URL", "postgresql://bms:bms-dev@db:5432/bms")
    with psycopg.connect(url) as conn:
        log.info("đã nạp dữ liệu demo" if seed(conn) else "đã có dữ liệu demo: chỉ bổ sung phần mới")
    return 0


# ===== Điểm chạy chính =====
if __name__ == "__main__":
    sys.exit(main())
