"""Nạp dữ liệu demo Tập đoàn X (ADR #16): chạy sau `migrate`, bỏ qua nếu đã có, tắt bằng SEED_DEMO=false.

Đề nghị mua sắm mẫu đi qua đúng các hàm CSDL (gửi duyệt, duyệt, trả về) nên dừng ở
đúng bước của chuỗi duyệt; flow-sync tự tạo tiến trình Flowable tương ứng.
"""

import logging
import os
import sys

import psycopg
from faker import Faker

from .demo import CONTRACT_SEATS, DEMO_USERS, TENANTS, TREES, UNIT_TYPES, VACANT, account_id, uid, walk

log = logging.getLogger("seed")
START = "2025-01-01T00:00:00+07:00"

# (tenant, ghế người lập, tiêu đề, số tiền, nhóm hàng, các bước đã xử lý: (quyết định, ghế người xử lý, ghi chú))
PURCHASE_REQUESTS = [
    ("TDX", "DT_MH.S1", "Linh kiện thay thế cho lô điện thoại bị ảnh hưởng", 650_000_000, None,
     [("APPROVE", "DT.HEAD", None)]),                                   # chờ TGĐ
    ("TDX", "CHIP_PS.S1", "Máy đếm hạt bụi phòng sạch", 35_000_000, None, []),   # chờ quản đốc phòng sạch
    ("TDX", "CHIP_KD.S2", "Mẫu thử cho khách hàng B2B", 90_000_000, None, []),   # chờ giám đốc Chip X (đang ủy quyền)
    ("TDX", "GD_KTHT.S1", "Bộ dụng cụ sửa chữa cho đội kỹ thuật", 120_000_000, None, []),  # chờ giám đốc Gia dụng X
    ("TDX", "CHIP_RD_KC.S1", "Bo mạch thử nghiệm cho kiểm chứng", 25_000_000, None, []),  # trưởng phòng trống: lên giám đốc R&D
    ("TDX", "GD_BH.HD1", "Thiết bị đo cho tư vấn bảo hành", 15_000_000, None, []),  # người làm hợp đồng lập
    ("TDX", "TDX_CDS.S2", "Máy chủ cho nền tảng DX-OS", 300_000_000, None, []),   # công ty mẹ: lên TGĐ
    ("TDX", "DT_MH.S1", "Văn phòng phẩm quý IV", 8_000_000, None,
     [("RETURN", "DT_MH.HEAD", "Tách riêng mực in, bổ sung báo giá thứ hai")]),
    ("TDX", "CHIP_PS.S2", "Bảo trì hệ thống điều hòa phòng sạch", 45_000_000, None,
     [("APPROVE", "CHIP_PS.HEAD", None)]),                               # đã duyệt
    ("BVX", "BVX_CDHA.S1", "Máy siêu âm 4D", 200_000_000, "TBYT", []),   # thiết bị y tế: 2 cấp
]


class Seeder:
    def __init__(self, conn: psycopg.Connection, faker_seed: int = 2026):
        self.conn = conn
        self.fake = Faker("vi_VN")
        self.fake.seed_instance(faker_seed)
        self.unit_types: dict[tuple[str, str], object] = {}
        self.titles: dict[tuple[str, str], object] = {}
        self.positions: dict[tuple[str, str], object] = {}   # (tenant, khóa ghế) -> id
        self.holders: dict[tuple[str, str], object] = {}     # (tenant, khóa ghế) -> person id
        self.codes: dict[str, int] = {}

    def x(self, sql: str, *args):
        return self.conn.execute(sql, args)

    def tenant_id(self, code: str):
        return uid("tenant", code)

    # --- Tổ chức --------------------------------------------------------------

    def title(self, tenant: str, name: str):
        key = (tenant, name)
        if key not in self.titles:
            self.titles[key] = uid(tenant, "JOB_TITLE", name)
            self.x("""INSERT INTO core.catalog_item (tenant_id, id, catalog, code, name)
                      VALUES (%s, %s, 'JOB_TITLE', %s, %s)""",
                   self.tenant_id(tenant), self.titles[key], f"CT{len(self.titles):03d}", name)
        return self.titles[key]

    def position(self, tenant, key, unit_code, name, head=False, reports_to=None):
        pid = uid(tenant, "position", key)
        self.x("""INSERT INTO core.position (tenant_id, id, org_unit_id, job_title_id, name, is_head, reports_to_id, valid_period)
                  VALUES (%s, %s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
               self.tenant_id(tenant), pid, uid(tenant, "unit", unit_code), self.title(tenant, name),
               name, head, self.positions.get((tenant, reports_to)) if reports_to else None, START)
        self.positions[(tenant, key)] = pid

    def org(self, tenant: str):
        tid = self.tenant_id(tenant)
        for code, name in UNIT_TYPES.items():
            self.unit_types[(tenant, code)] = uid(tenant, "UNIT_TYPE", code)
            self.x("INSERT INTO core.catalog_item (tenant_id, id, catalog, code, name) VALUES (%s, %s, 'UNIT_TYPE', %s, %s)",
                   tid, self.unit_types[(tenant, code)], code, name)
        for unit, parent in walk(TREES[tenant]):
            self.x("""INSERT INTO core.org_unit (tenant_id, id, parent_id, unit_type_id, code, name, is_legal_entity, valid_period)
                      VALUES (%s, %s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                   tid, uid(tenant, "unit", unit.code), uid(tenant, "unit", parent.code) if parent else None,
                   self.unit_types[(tenant, unit.type)], unit.code, unit.name, unit.legal, START)
            head = f"{unit.code}.HEAD"
            self.position(tenant, head, unit.code, unit.head, head=True)
            for i, deputy in enumerate(unit.deputies, 1):
                self.position(tenant, f"{unit.code}.DEP{i}", unit.code, deputy, reports_to=head)
            for i in range(1, unit.staff + 1):
                self.position(tenant, f"{unit.code}.S{i}", unit.code, unit.staff_title)
        for t, key, unit_code, name, reports_to in CONTRACT_SEATS:
            if t == tenant:
                self.position(tenant, key, unit_code, name, reports_to=reports_to)

    # --- Người và bổ nhiệm ----------------------------------------------------

    def person(self, tenant: str, full_name: str, person_id=None, subject=None):
        self.codes[tenant] = self.codes.get(tenant, 0) + 1
        person_id = person_id or uid(tenant, "person", str(self.codes[tenant]))
        self.x("""INSERT INTO core.person (tenant_id, id, idp_subject, full_name, employee_code)
                  VALUES (%s, %s, %s, %s, %s)""",
               self.tenant_id(tenant), person_id, subject, full_name, f"{tenant}-{self.codes[tenant]:04d}")
        return person_id

    def assign(self, tenant, person_id, seat, kind="PRIMARY"):
        if kind == "CONTRACT":
            period, contract = "tstzrange(now() - interval '3 months', now() + interval '6 months')", "HĐ-2026-017"
        else:
            period, contract = f"tstzrange('{START}', NULL)", None
        self.x(f"""INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period, contract_no)
                   VALUES (%s, %s, %s, %s, {period}, %s)""",
               self.tenant_id(tenant), person_id, self.positions[(tenant, seat)], kind, contract)
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
                        seat.tenant, user.full_name,
                        person_id=user.id if first else uid(seat.tenant, "person", user.username),
                        subject=str(user.id))
                self.assign(seat.tenant, persons[seat.tenant], seat.position, seat.type)
        for (tenant, seat) in self.positions:
            if (tenant, seat) in self.holders or (tenant, seat) in VACANT or ".HD" in seat:
                continue
            self.assign(tenant, self.person(tenant, self.fake_name()), seat)

    # --- Phân quyền, hạn mức, ủy quyền ----------------------------------------

    def roles(self, tenant: str):
        tid = self.tenant_id(tenant)
        roles = {
            "NHAN_VIEN": ("Nhân viên", ["proc.purchase_request.create", "proc.purchase_request.read"]),
            "QUAN_LY": ("Quản lý", ["proc.purchase_request.read", "wf.approval.act"]),
            "KIEM_SOAT": ("Kiểm soát tài chính", ["proc.purchase_request.read"]),
            "QUAN_TRI_TO_CHUC": ("Quản trị tổ chức", ["core.org.manage", "core.permission.manage"]),
        }
        for code, (name, perms) in roles.items():
            rid = uid(tenant, "role", code)
            self.x("INSERT INTO core.role (tenant_id, id, code, name) VALUES (%s, %s, %s, %s)", tid, rid, code, name)
            for perm in perms:
                self.x("INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (%s, %s, %s)",
                       tid, rid, perm)

        def grant(role, scope, unit=None, position=None):
            self.x("""INSERT INTO core.role_grant (tenant_id, role_id, org_unit_id, position_id, scope, valid_period)
                      VALUES (%s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                   tid, uid(tenant, "role", role), unit, position, scope, START)

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
        rules += [(tdx, 0, 50e6, 1, None, None, None), (tdx, 50e6, 500e6, 1, "CONG_TY", None, None),
                  (tdx, 500e6, None, 1, "CONG_TY", None, None), (tdx, 500e6, None, 2, "TAP_DOAN", None, None)]
        # Các khối của công ty mẹ không thuộc công ty con nào: từ 50 tr lên thẳng TGĐ.
        for unit in TREES["TDX"].children:
            if unit.type != "CONG_TY":
                rules += [(tdx, 0, 50e6, 1, None, unit.code, None), (tdx, 50e6, None, 1, "TAP_DOAN", unit.code, None)]
        # Bệnh viện X: < 50 tr quản lý trực tiếp, từ 50 tr giám đốc bệnh viện; thiết bị y tế luôn duyệt 2 cấp.
        rules += [(bvx, 0, 50e6, 1, None, None, None), (bvx, 50e6, None, 1, "BENH_VIEN", None, None),
                  (bvx, 0, None, 1, None, None, "TBYT"), (bvx, 0, None, 2, "BENH_VIEN", None, "TBYT")]
        for tid, lo, hi, step, unit_type, scope, category in rules:
            tenant = "TDX" if tid == tdx else "BVX"
            self.x("""INSERT INTO wf.approval_rule (tenant_id, process_code, min_amount, max_amount, step_order,
                                                    approver_unit_type_id, scope_unit_id, category_code, valid_period)
                      VALUES (%s, 'PURCHASE_REQUEST', %s, %s, %s, %s, %s, %s, tstzrange(%s, NULL))""",
                   tid, lo, hi, step, self.unit_types[(tenant, unit_type)] if unit_type else None,
                   uid(tenant, "unit", scope) if scope else None, category, START)

    def delegation(self):
        # Giám đốc Chip X đi công tác, ủy quyền cho phó giám đốc (duyệt thay).
        self.x("""INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period, reason)
                  VALUES (%s, %s, %s, %s, tstzrange(now() - interval '1 day', now() + interval '60 days'),
                          'Đi công tác Hàn Quốc')""",
               self.tenant_id("TDX"), self.holders[("TDX", "CHIP.HEAD")], self.holders[("TDX", "CHIP.DEP1")],
               self.positions[("TDX", "CHIP.HEAD")])

    def purchase_requests(self):
        for tenant, seat, title, amount, category, steps in PURCHASE_REQUESTS:
            requester = self.holders[(tenant, seat)]
            pr_id = self.x("""INSERT INTO proc.purchase_request (tenant_id, title, requester_id, requester_position_id,
                                                                 total_amount, category_code)
                              VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                           self.tenant_id(tenant), title, requester, self.positions[(tenant, seat)], amount,
                           category).fetchone()[0]
            self.x("SELECT proc.submit_purchase_request(%s, %s)", pr_id, requester)
            for decision, actor_seat, note in steps:
                task = self.x("""SELECT t.id FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                                 WHERE s.entity_id = %s AND t.status = 'OPEN'""", pr_id).fetchone()[0]
                self.x("SELECT wf.act(%s, %s, %s, %s)", task, self.holders[(tenant, actor_seat)], decision, note)

    def run(self):
        for t in TENANTS:
            self.x("INSERT INTO core.tenant (id, code, name) VALUES (%s, %s, %s)", self.tenant_id(t.code), t.code, t.name)
        for t in TENANTS:
            if t.parent:
                self.x("INSERT INTO core.tenant_relation (parent_tenant_id, child_tenant_id) VALUES (%s, %s)",
                       self.tenant_id(t.parent), self.tenant_id(t.code))
        for t in TENANTS:
            self.org(t.code)
        self.people()
        # Kiểm tra ngay trong giao dịch (trigger chuyển việc mặc định chạy lúc commit).
        self.x("SET CONSTRAINTS ALL IMMEDIATE")
        for t in TENANTS:
            self.roles(t.code)
        self.approval_rules()
        self.delegation()
        self.purchase_requests()


def seed(conn: psycopg.Connection) -> bool:
    """Nạp dữ liệu demo trong một giao dịch. Trả về False nếu đã có."""
    if conn.execute("SELECT 1 FROM core.tenant WHERE code = 'TDX'").fetchone():
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
        log.info("đã nạp dữ liệu demo" if seed(conn) else "đã có dữ liệu demo: bỏ qua")
    return 0


if __name__ == "__main__":
    sys.exit(main())
