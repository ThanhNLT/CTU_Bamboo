# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Dữ liệu demo Tập đoàn X: cây tổ chức, tài khoản demo (dùng chung cho seed và realm Keycloak, ADR #23).

Id tenant, đơn vị, vị trí và tài khoản demo cố định bằng uuid5 nên CSDL và Keycloak
khớp nhau mà không gọi API lẫn nhau. Tài khoản demo đặt tên theo vai trò.
"""

import uuid
from dataclasses import dataclass, field

DEMO_NS = uuid.UUID("7d3f0a52-1c4b-5e8f-9a6d-2b7c4e1f0a93")


def uid(*parts: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, ":".join(parts))


def account_id(username: str) -> uuid.UUID:
    """Id tài khoản Keycloak (= `sub`) và id người ở tenant giữ chính (ADR #23)."""
    return uid("account", username)


@dataclass(frozen=True)
class Tenant:
    code: str
    name: str
    parent: str | None = None


TENANTS = [Tenant("TDX", "Tập đoàn X"), Tenant("BVX", "Bệnh viện X", parent="TDX")]

UNIT_TYPES = {
    "TAP_DOAN": "Tập đoàn", "CONG_TY": "Công ty", "BENH_VIEN": "Bệnh viện", "HOI_DONG": "Hội đồng",
    "KHOI": "Khối", "PHONG": "Phòng", "VAN_PHONG": "Văn phòng", "NHA_MAY": "Nhà máy",
    "PHAN_XUONG": "Phân xưởng", "MIEN": "Miền", "CHI_NHANH": "Chi nhánh", "TRUNG_TAM": "Trung tâm",
    "DOI": "Đội", "KHOA": "Khoa",
}


@dataclass
class Unit:
    code: str
    name: str
    type: str
    head: str                       # chức danh vị trí trưởng
    staff: int = 2                  # số ghế nhân viên
    staff_title: str = "Chuyên viên"
    legal: bool = False             # công ty (pháp nhân)
    deputies: list[str] = field(default_factory=list)
    children: list["Unit"] = field(default_factory=list)


def U(code, name, type_, head, staff=2, staff_title="Chuyên viên", legal=False, deputies=(), children=()):
    return Unit(code, name, type_, head, staff, staff_title, legal, list(deputies), list(children))


TREES = {
    "TDX": U("TDX", "Tập đoàn X", "TAP_DOAN", "Tổng giám đốc", staff=0, legal=True,
             deputies=["Phó tổng giám đốc"], children=[
        U("TDX_HDQT", "Hội đồng quản trị", "HOI_DONG", "Chủ tịch HĐQT", staff=2, staff_title="Thành viên HĐQT"),
        U("TDX_TC", "Khối Tài chính", "KHOI", "Giám đốc tài chính", staff=3),
        U("TDX_NS", "Khối Nhân sự", "KHOI", "Giám đốc nhân sự", staff=2),
        U("TDX_PC", "Khối Pháp chế", "KHOI", "Giám đốc pháp chế", staff=2),
        U("TDX_CDS", "Văn phòng Chuyển đổi số", "VAN_PHONG", "Giám đốc chuyển đổi số (CDO)", staff=3,
          staff_title="Kỹ sư nền tảng"),
        U("CHIP", "Công ty Chip X", "CONG_TY", "Giám đốc", staff=0, legal=True, deputies=["Phó giám đốc"], children=[
            U("CHIP_RD", "Khối R&D", "KHOI", "Giám đốc R&D", staff=0, children=[
                U("CHIP_RD_TK", "Phòng Thiết kế vi mạch", "PHONG", "Trưởng phòng", staff=4, staff_title="Kỹ sư thiết kế"),
                U("CHIP_RD_KC", "Phòng Kiểm chứng", "PHONG", "Trưởng phòng", staff=3, staff_title="Kỹ sư kiểm chứng"),
            ]),
            U("CHIP_SX", "Khối Sản xuất", "KHOI", "Giám đốc sản xuất", staff=0, children=[
                U("CHIP_NM1", "Nhà máy 1", "NHA_MAY", "Giám đốc nhà máy", staff=1, children=[
                    U("CHIP_PS", "Phòng sạch", "PHAN_XUONG", "Quản đốc", staff=4, staff_title="Kỹ thuật viên"),
                    U("CHIP_PX", "Phân xưởng", "PHAN_XUONG", "Quản đốc", staff=4, staff_title="Kỹ thuật viên"),
                ]),
            ]),
            U("CHIP_CL", "Khối Chất lượng", "KHOI", "Giám đốc chất lượng", staff=2, staff_title="Kỹ sư chất lượng"),
            U("CHIP_KD", "Khối Kinh doanh B2B", "KHOI", "Giám đốc kinh doanh", staff=3),
        ]),
        U("DT", "Công ty Điện thoại X", "CONG_TY", "Giám đốc", staff=0, legal=True, deputies=["Phó giám đốc"], children=[
            U("DT_RD", "Khối R&D", "KHOI", "Giám đốc R&D", staff=0, children=[
                U("DT_RD_PC", "Phòng Phần cứng", "PHONG", "Trưởng phòng", staff=3, staff_title="Kỹ sư phần cứng"),
                U("DT_RD_PM", "Phòng Phần mềm", "PHONG", "Trưởng phòng", staff=3, staff_title="Kỹ sư phần mềm"),
                U("DT_RD_TK", "Phòng Thiết kế công nghiệp", "PHONG", "Trưởng phòng", staff=2, staff_title="Nhà thiết kế"),
            ]),
            U("DT_CCU", "Khối Chuỗi cung ứng", "KHOI", "Giám đốc chuỗi cung ứng", staff=0, children=[
                U("DT_MH", "Phòng Mua hàng", "PHONG", "Trưởng phòng", staff=3),
                U("DT_KV", "Phòng Kho vận", "PHONG", "Trưởng phòng", staff=2),
            ]),
            U("DT_NM", "Nhà máy lắp ráp", "NHA_MAY", "Giám đốc nhà máy", staff=4, staff_title="Kỹ thuật viên"),
            U("DT_KD", "Khối Kinh doanh", "KHOI", "Giám đốc kinh doanh", staff=3),
        ]),
        U("GD", "Công ty Gia dụng X", "CONG_TY", "Giám đốc", staff=0, legal=True, deputies=["Phó giám đốc"], children=[
            U("GD_NM", "Nhà máy", "NHA_MAY", "Giám đốc nhà máy", staff=3, staff_title="Kỹ thuật viên"),
            U("GD_PP", "Khối Phân phối", "KHOI", "Giám đốc phân phối", staff=0, children=[
                U("GD_MB", "Miền Bắc", "MIEN", "Giám đốc miền", staff=1, children=[
                    U("GD_CN_HN", "Chi nhánh Hà Nội", "CHI_NHANH", "Giám đốc chi nhánh", staff=2),
                ]),
                U("GD_MN", "Miền Nam", "MIEN", "Giám đốc miền", staff=1, children=[
                    U("GD_CN_HCM", "Chi nhánh TP.HCM", "CHI_NHANH", "Giám đốc chi nhánh", staff=2),
                ]),
            ]),
            U("GD_BH", "Trung tâm Bảo hành", "TRUNG_TAM", "Giám đốc trung tâm", staff=2, children=[
                U("GD_KTHT", "Đội kỹ thuật hiện trường", "DOI", "Đội trưởng", staff=4, staff_title="Kỹ thuật viên"),
            ]),
        ]),
    ]),
    "BVX": U("BVX", "Bệnh viện X", "BENH_VIEN", "Giám đốc bệnh viện", staff=0, legal=True,
             deputies=["Phó giám đốc"], children=[
        U("BVX_LS", "Khối Lâm sàng", "KHOI", "Trưởng khối", staff=0, children=[
            U("BVX_NOI", "Khoa Nội", "KHOA", "Trưởng khoa", staff=3, staff_title="Bác sĩ"),
            U("BVX_NGOAI", "Khoa Ngoại", "KHOA", "Trưởng khoa", staff=3, staff_title="Bác sĩ"),
            U("BVX_CC", "Khoa Cấp cứu", "KHOA", "Trưởng khoa", staff=3, staff_title="Bác sĩ"),
        ]),
        U("BVX_CLS", "Khối Cận lâm sàng", "KHOI", "Trưởng khối", staff=0, children=[
            U("BVX_XN", "Khoa Xét nghiệm", "KHOA", "Trưởng khoa", staff=2, staff_title="Kỹ thuật viên"),
            U("BVX_CDHA", "Khoa Chẩn đoán hình ảnh", "KHOA", "Trưởng khoa", staff=2, staff_title="Bác sĩ"),
        ]),
        U("BVX_DUOC", "Khoa Dược", "KHOA", "Trưởng khoa", staff=2, staff_title="Dược sĩ"),
        U("BVX_KHTH", "Phòng Kế hoạch tổng hợp", "PHONG", "Trưởng phòng", staff=2),
        U("BVX_TC", "Phòng Tài chính", "PHONG", "Trưởng phòng", staff=2),
    ]),
}

# Ghế theo hợp đồng (ADR #29): (tenant, mã ghế, đơn vị, chức danh, báo cáo cho).
CONTRACT_SEATS = [("TDX", "GD_BH.HD1", "GD_BH", "Kỹ sư tư vấn (hợp đồng)", "GD_BH.HEAD")]

# Ghế để trống: trình diễn đẩy lên cấp trên (ADR #28).
VACANT = {("TDX", "CHIP_RD_KC.HEAD")}


@dataclass(frozen=True)
class Seat:
    tenant: str
    position: str              # khóa vị trí, ví dụ "DT_MH.S1", "CHIP.HEAD", "TDX.DEP1"
    type: str = "PRIMARY"      # PRIMARY / CONCURRENT / CONTRACT


@dataclass(frozen=True)
class DemoUser:
    username: str
    full_name: str
    seats: tuple[Seat, ...]
    realm_roles: tuple[str, ...] = ()

    @property
    def id(self) -> uuid.UUID:
        return account_id(self.username)


def _u(username, full_name, *seats, roles=()):
    return DemoUser(username, full_name, tuple(seats), tuple(roles))


DEMO_USERS = [
    _u("tgd", "Nguyễn Văn Thành", Seat("TDX", "TDX.HEAD")),
    _u("pho.tgd", "Trần Thị Mai", Seat("TDX", "TDX.DEP1")),
    _u("cdo", "Lê Quang Huy", Seat("TDX", "TDX_CDS.HEAD")),
    _u("gd.taichinh", "Phạm Thu Hà", Seat("TDX", "TDX_TC.HEAD")),
    _u("gd.chip", "Hoàng Minh Đức", Seat("TDX", "CHIP.HEAD")),
    _u("pgd.chip", "Vũ Thị Lan", Seat("TDX", "CHIP.DEP1")),
    _u("qd.phongsach.chip", "Đặng Văn Long", Seat("TDX", "CHIP_PS.HEAD")),
    _u("kd.chip", "Bùi Thị Ngọc", Seat("TDX", "CHIP_KD.S1")),
    _u("gd.dienthoai", "Ngô Thanh Sơn", Seat("TDX", "DT.HEAD")),
    _u("tp.muahang.dienthoai", "Đỗ Thị Hương", Seat("TDX", "DT_MH.HEAD")),
    _u("nv.muahang.dienthoai", "Phan Văn Nam", Seat("TDX", "DT_MH.S1")),
    _u("gd.giadung", "Lý Thị Thảo", Seat("TDX", "GD.HEAD")),
    _u("gd.baohanh.giadung", "Trịnh Văn Hải", Seat("TDX", "GD_BH.HEAD")),
    _u("gd.benhvien", "Võ Thị Bích", Seat("BVX", "BVX.HEAD")),
    _u("tk.duoc.benhvien", "Dương Văn Khoa", Seat("BVX", "BVX_DUOC.HEAD")),
    _u("bs.cdha.benhvien", "Lưu Thị Yến", Seat("BVX", "BVX_CDHA.S1")),
    # Một tài khoản cho hai tenant cùng công ty mẹ (ADR #30).
    _u("kiemnhiem", "Mai Xuân Phúc", Seat("TDX", "TDX_PC.S1"), Seat("BVX", "BVX_KHTH.S1", "CONCURRENT")),
    # Giữ chính ở Chip X, làm hợp đồng ngoài giờ cho Gia dụng X (ADR #29).
    _u("hopdong", "Tạ Minh Tuấn", Seat("TDX", "CHIP_RD_TK.S1"), Seat("TDX", "GD_BH.HD1", "CONTRACT")),
    # Đội nền tảng, quản trị kỹ thuật: bắt buộc OTP (ADR #32).
    _u("admin", "Kiều Anh Quân", Seat("TDX", "TDX_CDS.S1"), roles=("platform_admin",)),
]


def walk(unit: Unit, parent: Unit | None = None):
    """Duyệt cây theo thứ tự cha trước con: (đơn vị, đơn vị cha)."""
    yield unit, parent
    for child in unit.children:
        yield from walk(child, unit)
