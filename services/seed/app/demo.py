# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import uuid
from dataclasses import dataclass, field

DEMO_NS = uuid.UUID("7d3f0a52-1c4b-5e8f-9a6d-2b7c4e1f0a93")


def uid(*parts: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, ":".join(parts))


def account_id(username: str) -> uuid.UUID:
    return uid("account", username)


@dataclass(frozen=True)
class Tenant:
    code: str
    name: str
    parent: str | None = None


TENANTS = [Tenant("TDX", "Tập đoàn X"), Tenant("BVX", "Bệnh viện X", parent="TDX")]

UNIT_TYPES = {
    "TAP_DOAN": "Tập đoàn",
    "CONG_TY": "Công ty",
    "BENH_VIEN": "Bệnh viện",
    "HOI_DONG": "Hội đồng",
    "KHOI": "Khối",
    "PHONG": "Phòng",
    "VAN_PHONG": "Văn phòng",
    "NHA_MAY": "Nhà máy",
    "PHAN_XUONG": "Phân xưởng",
    "MIEN": "Miền",
    "CHI_NHANH": "Chi nhánh",
    "TRUNG_TAM": "Trung tâm",
    "DOI": "Đội",
    "KHOA": "Khoa",
}


@dataclass
class Unit:
    code: str
    name: str
    type: str
    head: str
    staff: int = 2
    staff_title: str = "Chuyên viên"
    legal: bool = False
    deputies: list[str] = field(default_factory=list)
    children: list["Unit"] = field(default_factory=list)


def U(code, name, type_, head, staff=2, staff_title="Chuyên viên", legal=False, deputies=(), children=()):
    return Unit(code, name, type_, head, staff, staff_title, legal, list(deputies), list(children))


TREES = {
    "TDX": U(
        "TDX",
        "Tập đoàn X",
        "TAP_DOAN",
        "Tổng giám đốc",
        staff=0,
        legal=True,
        deputies=["Phó tổng giám đốc"],
        children=[
            U("TDX_HDQT", "Hội đồng quản trị", "HOI_DONG", "Chủ tịch HĐQT", staff=2, staff_title="Thành viên HĐQT"),
            U("TDX_TC", "Khối Tài chính", "KHOI", "Giám đốc tài chính", staff=3),
            U("TDX_NS", "Khối Nhân sự", "KHOI", "Giám đốc nhân sự", staff=2),
            U("TDX_PC", "Khối Pháp chế", "KHOI", "Giám đốc pháp chế", staff=2),
            U(
                "TDX_CDS",
                "Văn phòng Chuyển đổi số",
                "VAN_PHONG",
                "Giám đốc chuyển đổi số (CDO)",
                staff=3,
                staff_title="Kỹ sư nền tảng",
            ),
            U(
                "CHIP",
                "Công ty Chip X",
                "CONG_TY",
                "Giám đốc",
                staff=0,
                legal=True,
                deputies=["Phó giám đốc"],
                children=[
                    U(
                        "CHIP_RD",
                        "Khối R&D",
                        "KHOI",
                        "Giám đốc R&D",
                        staff=0,
                        children=[
                            U(
                                "CHIP_RD_TK",
                                "Phòng Thiết kế vi mạch",
                                "PHONG",
                                "Trưởng phòng",
                                staff=4,
                                staff_title="Kỹ sư thiết kế",
                            ),
                            U(
                                "CHIP_RD_KC",
                                "Phòng Kiểm chứng",
                                "PHONG",
                                "Trưởng phòng",
                                staff=3,
                                staff_title="Kỹ sư kiểm chứng",
                            ),
                        ],
                    ),
                    U(
                        "CHIP_SX",
                        "Khối Sản xuất",
                        "KHOI",
                        "Giám đốc sản xuất",
                        staff=0,
                        children=[
                            U(
                                "CHIP_NM1",
                                "Nhà máy 1",
                                "NHA_MAY",
                                "Giám đốc nhà máy",
                                staff=1,
                                children=[
                                    U(
                                        "CHIP_PS",
                                        "Phòng sạch",
                                        "PHAN_XUONG",
                                        "Quản đốc",
                                        staff=4,
                                        staff_title="Kỹ thuật viên",
                                    ),
                                    U(
                                        "CHIP_PX",
                                        "Phân xưởng",
                                        "PHAN_XUONG",
                                        "Quản đốc",
                                        staff=4,
                                        staff_title="Kỹ thuật viên",
                                    ),
                                ],
                            ),
                        ],
                    ),
                    U(
                        "CHIP_CL",
                        "Khối Chất lượng",
                        "KHOI",
                        "Giám đốc chất lượng",
                        staff=2,
                        staff_title="Kỹ sư chất lượng",
                    ),
                    U("CHIP_KD", "Khối Kinh doanh B2B", "KHOI", "Giám đốc kinh doanh", staff=3),
                ],
            ),
            U(
                "DT",
                "Công ty Điện thoại X",
                "CONG_TY",
                "Giám đốc",
                staff=0,
                legal=True,
                deputies=["Phó giám đốc"],
                children=[
                    U(
                        "DT_RD",
                        "Khối R&D",
                        "KHOI",
                        "Giám đốc R&D",
                        staff=0,
                        children=[
                            U(
                                "DT_RD_PC",
                                "Phòng Phần cứng",
                                "PHONG",
                                "Trưởng phòng",
                                staff=3,
                                staff_title="Kỹ sư phần cứng",
                            ),
                            U(
                                "DT_RD_PM",
                                "Phòng Phần mềm",
                                "PHONG",
                                "Trưởng phòng",
                                staff=3,
                                staff_title="Kỹ sư phần mềm",
                            ),
                            U(
                                "DT_RD_TK",
                                "Phòng Thiết kế công nghiệp",
                                "PHONG",
                                "Trưởng phòng",
                                staff=2,
                                staff_title="Nhà thiết kế",
                            ),
                        ],
                    ),
                    U(
                        "DT_CCU",
                        "Khối Chuỗi cung ứng",
                        "KHOI",
                        "Giám đốc chuỗi cung ứng",
                        staff=0,
                        children=[
                            U("DT_MH", "Phòng Mua hàng", "PHONG", "Trưởng phòng", staff=3),
                            U("DT_KV", "Phòng Kho vận", "PHONG", "Trưởng phòng", staff=2),
                        ],
                    ),
                    U("DT_NM", "Nhà máy lắp ráp", "NHA_MAY", "Giám đốc nhà máy", staff=4, staff_title="Kỹ thuật viên"),
                    U("DT_KD", "Khối Kinh doanh", "KHOI", "Giám đốc kinh doanh", staff=3),
                ],
            ),
            U(
                "GD",
                "Công ty Gia dụng X",
                "CONG_TY",
                "Giám đốc",
                staff=0,
                legal=True,
                deputies=["Phó giám đốc"],
                children=[
                    U("GD_NM", "Nhà máy", "NHA_MAY", "Giám đốc nhà máy", staff=3, staff_title="Kỹ thuật viên"),
                    U(
                        "GD_PP",
                        "Khối Phân phối",
                        "KHOI",
                        "Giám đốc phân phối",
                        staff=0,
                        children=[
                            U(
                                "GD_MB",
                                "Miền Bắc",
                                "MIEN",
                                "Giám đốc miền",
                                staff=1,
                                children=[
                                    U("GD_CN_HN", "Chi nhánh Hà Nội", "CHI_NHANH", "Giám đốc chi nhánh", staff=2),
                                ],
                            ),
                            U(
                                "GD_MN",
                                "Miền Nam",
                                "MIEN",
                                "Giám đốc miền",
                                staff=1,
                                children=[
                                    U("GD_CN_HCM", "Chi nhánh TP.HCM", "CHI_NHANH", "Giám đốc chi nhánh", staff=2),
                                ],
                            ),
                        ],
                    ),
                    U(
                        "GD_BH",
                        "Trung tâm Bảo hành",
                        "TRUNG_TAM",
                        "Giám đốc trung tâm",
                        staff=2,
                        children=[
                            U(
                                "GD_KTHT",
                                "Đội kỹ thuật hiện trường",
                                "DOI",
                                "Đội trưởng",
                                staff=4,
                                staff_title="Kỹ thuật viên",
                            ),
                        ],
                    ),
                ],
            ),
        ],
    ),
    "BVX": U(
        "BVX",
        "Bệnh viện X",
        "BENH_VIEN",
        "Giám đốc bệnh viện",
        staff=0,
        legal=True,
        deputies=["Phó giám đốc"],
        children=[
            U(
                "BVX_LS",
                "Khối Lâm sàng",
                "KHOI",
                "Trưởng khối",
                staff=0,
                children=[
                    U("BVX_NOI", "Khoa Nội", "KHOA", "Trưởng khoa", staff=3, staff_title="Bác sĩ"),
                    U("BVX_NGOAI", "Khoa Ngoại", "KHOA", "Trưởng khoa", staff=3, staff_title="Bác sĩ"),
                    U("BVX_CC", "Khoa Cấp cứu", "KHOA", "Trưởng khoa", staff=3, staff_title="Bác sĩ"),
                ],
            ),
            U(
                "BVX_CLS",
                "Khối Cận lâm sàng",
                "KHOI",
                "Trưởng khối",
                staff=0,
                children=[
                    U("BVX_XN", "Khoa Xét nghiệm", "KHOA", "Trưởng khoa", staff=2, staff_title="Kỹ thuật viên"),
                    U("BVX_CDHA", "Khoa Chẩn đoán hình ảnh", "KHOA", "Trưởng khoa", staff=2, staff_title="Bác sĩ"),
                ],
            ),
            U("BVX_DUOC", "Khoa Dược", "KHOA", "Trưởng khoa", staff=2, staff_title="Dược sĩ"),
            U("BVX_KHTH", "Phòng Kế hoạch tổng hợp", "PHONG", "Trưởng phòng", staff=2),
            U("BVX_TC", "Phòng Tài chính", "PHONG", "Trưởng phòng", staff=2),
        ],
    ),
}

CONTRACT_SEATS = [("TDX", "GD_BH.HD1", "GD_BH", "Kỹ sư tư vấn (hợp đồng)", "GD_BH.HEAD")]

VACANT = {("TDX", "CHIP_RD_KC.HEAD")}


@dataclass(frozen=True)
class Seat:
    tenant: str
    position: str
    type: str = "PRIMARY"


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
    _u("kiemnhiem", "Mai Xuân Phúc", Seat("TDX", "TDX_PC.S1"), Seat("BVX", "BVX_KHTH.S1", "CONCURRENT")),
    _u("hopdong", "Tạ Minh Tuấn", Seat("TDX", "CHIP_RD_TK.S1"), Seat("TDX", "GD_BH.HD1", "CONTRACT")),
    _u("admin", "Kiều Anh Quân", Seat("TDX", "TDX_CDS.S1"), roles=("platform_admin",)),
]

HR_DEMO_USERS = [
    _u("ns.dienthoai", "Hồ Thị Thu Trang", Seat("TDX", "DT_NS.S1")),
    _u("ns.chip", "Châu Văn Phát", Seat("TDX", "CHIP_NS.S1")),
    _u("ns.giadung", "Lâm Thị Kim Ngân", Seat("TDX", "GD_NS.S1")),
    _u("ns.benhvien", "Quách Văn Toàn", Seat("BVX", "BVX_TCCB.S1")),
]


HR_UNITS = [
    ("TDX", "CHIP_NS", "Phòng Nhân sự", "CHIP", "PHONG", "Trưởng phòng nhân sự", 2, "Chuyên viên nhân sự"),
    ("TDX", "DT_NS", "Phòng Nhân sự", "DT", "PHONG", "Trưởng phòng nhân sự", 2, "Chuyên viên nhân sự"),
    ("TDX", "GD_NS", "Phòng Nhân sự", "GD", "PHONG", "Trưởng phòng nhân sự", 2, "Chuyên viên nhân sự"),
    ("BVX", "BVX_TCCB", "Phòng Tổ chức cán bộ", "BVX", "PHONG", "Trưởng phòng", 2, "Chuyên viên tổ chức"),
]
HR_SCOPE = {"CHIP_NS": "CHIP", "DT_NS": "DT", "GD_NS": "GD", "TDX_NS": "TDX", "BVX_TCCB": "BVX"}
TRANSFER_DEMO_USERS = [
    _u("tp.nhansu.dienthoai", "Nguyễn Thị Hồng Nhung", Seat("TDX", "DT_NS.HEAD")),
    _u("tp.phanmem.dienthoai", "Trần Quốc Bảo", Seat("TDX", "DT_RD_PM.HEAD")),
    _u("nv.phanmem.dienthoai", "Lê Hoàng Anh", Seat("TDX", "DT_RD_PM.S1")),
    _u("nv3.muahang.dienthoai", "Cao Thị Mỹ Linh", Seat("TDX", "DT_MH.S3")),
    _u("gd.nhansu.tapdoan", "Phạm Thị Thanh Vân", Seat("TDX", "TDX_NS.HEAD")),
    _u("tp.tccb.benhvien", "Đoàn Minh Châu", Seat("BVX", "BVX_TCCB.HEAD")),
    _u("tp.khth.benhvien", "Vương Hữu Phước", Seat("BVX", "BVX_KHTH.HEAD")),
]

OPEN_SEATS = [
    ("TDX", "DT_RD_PM.S4", "DT_RD_PM", "Kỹ sư phần mềm"),
    ("TDX", "DT_MH.S4", "DT_MH", "Chuyên viên"),
    ("TDX", "CHIP_RD_TK.S5", "CHIP_RD_TK", "Kỹ sư thiết kế"),
    ("TDX", "GD_NM.S4", "GD_NM", "Kỹ thuật viên"),
    ("BVX", "BVX_NOI.S4", "BVX_NOI", "Bác sĩ"),
    ("BVX", "BVX_KHTH.S3", "BVX_KHTH", "Chuyên viên kế hoạch"),
]


def walk(unit: Unit, parent: Unit | None = None):
    yield unit, parent
    for child in unit.children:
        yield from walk(child, unit)
