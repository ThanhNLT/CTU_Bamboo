"""Dữ liệu demo cho Không gian H, P, D (ADR #65, #66, #64): tin nhắn, lịch công tác, dự án, khóa cổng dịch vụ API.

Bám đúng các tài khoản và tình huống mô tả ở mục "Cơ sở dữ liệu demo" của README: `gd.chip` đang đi công tác và đã ủy quyền
cho `pgd.chip`, phòng sạch CR-02 của Chip X đang tụt chênh áp, đề nghị 650 triệu chờ Tổng giám đốc, máy siêu âm 4D của Bệnh
viện X, kịch bản điều chuyển nhân sự ở Điện thoại X. Mọi mốc thời gian tính quanh hôm nay để lịch, Gantt, tin nhắn luôn trông
như đang diễn ra. Mỗi phần tự kiểm đã nạp chưa (id cố định theo `uid`) nên chạy lại không nhân đôi.
"""

import datetime as dt
import hashlib
import json

from .demo import DEMO_USERS, HR_DEMO_USERS, TRANSFER_DEMO_USERS, uid

VN = dt.timezone(dt.timedelta(hours=7))
SEATS = {u.username: u.seats for u in (*DEMO_USERS, *HR_DEMO_USERS, *TRANSFER_DEMO_USERS)}


class HpdDemo:
    def __init__(self, seeder):
        self.s = seeder
        self.x = seeder.x
        self.today = dt.datetime.now(VN).date()
        self.monday = self.today - dt.timedelta(days=self.today.weekday())

    def who(self, username: str, tenant: str | None = None):
        for seat in SEATS[username]:
            if tenant is None or seat.tenant == tenant:
                return self.s._holder(seat.tenant, seat.position)
        raise KeyError(username)

    def tid(self, tenant: str):
        return self.s.tenant_id(tenant)

    def unit(self, tenant: str, code: str):
        return uid(tenant, "unit", code)

    def at(self, day_offset: int, hour: int = 9, minute: int = 0) -> dt.datetime:
        return dt.datetime.combine(self.today + dt.timedelta(days=day_offset), dt.time(hour, minute), VN)

    def exists(self, table: str, id_) -> bool:
        return bool(self.x(f"SELECT 1 FROM {table} WHERE id = %s", id_).fetchone())

    def run(self):
        for t in ("TDX", "BVX"):
            self.x("SELECT chat.sync_units(%s)", self.tid(t))
        self.projects()
        self.chat()
        self.calendar()
        self.api_keys()

    def _group(self, tenant: str, key: str, title: str, owner: str, members: list[str]):
        conv = uid(tenant, "conversation", key)
        if not self.exists("chat.conversation", conv):
            owner_id = self.who(owner, tenant)
            self.x(
                "INSERT INTO chat.conversation (tenant_id, id, kind, title, created_by) VALUES (%s, %s, 'GROUP', %s, %s)",
                self.tid(tenant),
                conv,
                title,
                owner_id,
            )
            for name in [owner, *members]:
                self.x(
                    "INSERT INTO chat.member (tenant_id, conversation_id, person_id, role) VALUES (%s, %s, %s, %s)",
                    self.tid(tenant),
                    conv,
                    self.who(name, tenant),
                    "OWNER" if name == owner else "MEMBER",
                )
        return conv

    def _direct(self, tenant: str, a: str, b: str):
        pa, pb = self.who(a, tenant), self.who(b, tenant)
        key = ":".join(sorted((str(pa), str(pb))))
        row = self.x(
            """INSERT INTO chat.conversation (tenant_id, kind, direct_key, created_by) VALUES (%s, 'DIRECT', %s, %s)
               ON CONFLICT (tenant_id, direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key RETURNING id""",
            self.tid(tenant),
            key,
            pa,
        ).fetchone()
        for p in (pa, pb):
            self.x(
                """INSERT INTO chat.member (tenant_id, conversation_id, person_id) VALUES (%s, %s, %s)
                   ON CONFLICT DO NOTHING""",
                self.tid(tenant),
                row[0],
                p,
            )
        return row[0]

    def _channel(self, tenant: str, code: str):
        return self.x(
            "SELECT id FROM chat.conversation WHERE tenant_id = %s AND org_unit_id = %s",
            self.tid(tenant),
            self.unit(tenant, code),
        ).fetchone()[0]

    def _say(self, tenant: str, conv, script: list[tuple]):
        """Gửi các tin theo kịch bản (người gửi, phút trước hiện tại, nội dung, [người được nhắc]) rồi lùi giờ gửi."""
        if self.x("SELECT 1 FROM chat.message WHERE conversation_id = %s LIMIT 1", conv).fetchone():
            return
        stamped = []
        for sender, minutes_ago, body, *mention in script:
            mentions = [self.who(m, tenant) for m in (mention[0] if mention else [])]
            msg = self.x(
                """INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body, mentions)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                self.tid(tenant),
                conv,
                self.who(sender, tenant),
                body,
                mentions,
            ).fetchone()[0]
            stamped.append((msg, minutes_ago))
        self.x("ALTER TABLE chat.message DISABLE TRIGGER message_before_write")
        for msg, minutes_ago in stamped:
            self.x(
                "UPDATE chat.message SET created_at = now() - make_interval(mins => %s) WHERE id = %s", minutes_ago, msg
            )
        self.x("ALTER TABLE chat.message ENABLE TRIGGER message_before_write")
        self.x(
            """UPDATE chat.conversation c SET last_message_at = m.at FROM
               (SELECT max(created_at) AS at FROM chat.message WHERE conversation_id = %s) m WHERE c.id = %s""",
            conv,
            conv,
        )

    def chat(self):
        day = 24 * 60
        self._say(
            "TDX",
            self._channel("TDX", "TDX"),
            [
                (
                    "tgd",
                    3 * day,
                    "Chào toàn tập đoàn. Từ tháng này mọi đề nghị mua sắm và điều chuyển đều lập, duyệt trên Bamboo.",
                ),
                (
                    "cdo",
                    3 * day - 20,
                    "Văn phòng Chuyển đổi số trực hỗ trợ cả tuần, cần gì nhắn kênh này hoặc nhắn riêng em.",
                ),
                ("gd.taichinh", 2 * day, "Khối Tài chính nhắc: đề nghị trên 500 triệu cần đính kèm ít nhất 3 báo giá."),
            ],
        )
        self._say(
            "TDX",
            self._channel("TDX", "DT_MH"),
            [
                ("tp.muahang.dienthoai", 2 * day, "Cả phòng lưu ý: báo giá linh kiện quý IV gửi trước thứ Sáu nhé."),
                ("nv.muahang.dienthoai", 2 * day - 35, "Em đã có 3 báo giá màn hình OLED, đang gộp vào đề nghị."),
                ("nv3.muahang.dienthoai", 2 * day - 30, "Em lo phần pin và sạc, chiều nay xong."),
                (
                    "tp.muahang.dienthoai",
                    90,
                    "@Phan Văn Nam đề nghị 650 triệu đã qua Giám đốc, đang chờ Tổng giám đốc. Em chuẩn bị bảng so sánh giá giúp chị.",
                    ["nv.muahang.dienthoai"],
                ),
                ("nv.muahang.dienthoai", 75, "Dạ chị, em gửi trong sáng mai."),
            ],
        )
        self._say(
            "TDX",
            self._channel("TDX", "CHIP_PS"),
            [
                (
                    "qd.phongsach.chip",
                    50,
                    "Cảnh báo: CR-02 chênh áp xuống dưới 10 Pa, hạt bụi ≥0,5 µm vượt ngưỡng ~15 phút.",
                ),
                ("qd.phongsach.chip", 45, "Đã dừng nạp wafer vào CR-02, kiểm tra cửa air-shower và bộ lọc HEPA số 3."),
                (
                    "qd.phongsach.chip",
                    20,
                    "Hạt bụi đã về 3.120/m³ (sát ngưỡng). Đề nghị máy đếm hạt bụi mới đang chờ duyệt.",
                ),
            ],
        )
        self._say(
            "TDX",
            self._direct("TDX", "nv.muahang.dienthoai", "tp.muahang.dienthoai"),
            [
                (
                    "nv.muahang.dienthoai",
                    60,
                    "Chị ơi đề nghị 18 triệu bị trả về vì thiếu báo giá, em bổ sung rồi gửi lại ạ.",
                ),
                ("nv.muahang.dienthoai", 58, "Em đính kèm báo giá PDF trong đề nghị luôn rồi."),
            ],
        )
        self._say(
            "TDX",
            self._direct("TDX", "gd.chip", "pgd.chip"),
            [
                (
                    "gd.chip",
                    2 * day,
                    "Anh đi Singapore làm việc với đối tác wafer đến hết tuần, đã ủy quyền duyệt cho em.",
                ),
                (
                    "pgd.chip",
                    2 * day - 10,
                    "Vâng anh, em xử lý hộp việc mỗi sáng. Đề nghị 90 triệu em duyệt thay hôm nay.",
                ),
                ("gd.chip", 30, "Em xem giúp việc CR-02, cần thì họp nhanh với anh Long qua video."),
            ],
        )
        board = self._group(
            "TDX",
            "ban-dieu-hanh",
            "Ban điều hành tập đoàn",
            "tgd",
            ["pho.tgd", "gd.taichinh", "cdo", "gd.chip", "gd.dienthoai", "gd.giadung"],
        )
        self._say(
            "TDX",
            board,
            [
                (
                    "tgd",
                    day + 120,
                    "Thứ Năm này họp duyệt đề nghị 650 triệu của Điện thoại X, các anh chị xem trước hồ sơ.",
                ),
                ("gd.dienthoai", day + 100, "Em đã duyệt bước 1, bảng so sánh giá phòng Mua hàng gửi sáng mai."),
                ("gd.taichinh", day + 80, "Ngân sách quý IV còn đủ, tôi đồng ý về nguyên tắc."),
                (
                    "cdo",
                    180,
                    "Dự án DX-2027: thí điểm Điện thoại X đang chậm 5 ngày ở phần nhập danh mục, báo cáo tuần đã gửi.",
                ),
            ],
        )
        transfer = self._group(
            "TDX",
            "dieu-chuyen-q4",
            "Điều chuyển nhân sự quý IV",
            "gd.nhansu.tapdoan",
            ["tp.nhansu.dienthoai", "tp.phanmem.dienthoai", "ns.dienthoai"],
        )
        self._say(
            "TDX",
            transfer,
            [
                (
                    "gd.nhansu.tapdoan",
                    day,
                    "Quý IV có 2 đề nghị điều chuyển: nội bộ Điện thoại X và một trường hợp sang Bệnh viện X.",
                ),
                ("tp.phanmem.dienthoai", day - 30, "Phòng Phần mềm còn ghế kỹ sư trống, sẵn sàng nhận."),
                ("tp.nhansu.dienthoai", day - 25, "Hồ sơ đầy đủ rồi, em duyệt bước nhân sự trong hôm nay."),
            ],
        )
        self._say(
            "BVX",
            self._channel("BVX", "BVX_CDHA"),
            [
                (
                    "bs.cdha.benhvien",
                    3 * day,
                    "Máy siêu âm 4D cũ báo lỗi đầu dò lần thứ 3 trong tháng, em đã lập đề nghị thay.",
                ),
            ],
        )
        medical = self._group(
            "BVX", "thiet-bi-y-te", "Mua sắm thiết bị y tế", "gd.benhvien", ["bs.cdha.benhvien", "tk.duoc.benhvien"]
        )
        self._say(
            "BVX",
            medical,
            [
                (
                    "gd.benhvien",
                    day,
                    "Đề nghị máy siêu âm 4D đang ở bước 2, chị duyệt sau khi có ý kiến khoa Dược về vật tư.",
                ),
                ("tk.duoc.benhvien", day - 40, "Khoa Dược đồng ý, gel và đầu dò dùng chung nhà cung cấp hiện tại."),
                ("bs.cdha.benhvien", 120, "Cảm ơn chị, em gửi thêm cấu hình máy để Hội đồng thiết bị xem thứ Sáu."),
            ],
        )

    def _event(self, tenant: str, key: str, **f):
        eid = uid(tenant, "cal", key)
        if self.exists("cal.event", eid):
            return
        attendees = f.pop("attendees", {})
        self.x(
            """INSERT INTO cal.event (tenant_id, id, title, description, location, kind, starts_at, ends_at, all_day,
                   recurrence, recur_until, scope, org_unit_id, organizer_id, reminder_minutes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            self.tid(tenant),
            eid,
            f["title"],
            f.get("description"),
            f.get("location"),
            f.get("kind", "MEETING"),
            f["starts"],
            f["ends"],
            f.get("all_day", False),
            f.get("recurrence", "NONE"),
            f.get("until"),
            "UNIT" if f.get("unit") else "PERSONAL",
            self.unit(tenant, f["unit"]) if f.get("unit") else None,
            self.who(f["organizer"], tenant),
            f.get("reminder"),
        )
        for name, response in attendees.items():
            self.x(
                """INSERT INTO cal.attendee (tenant_id, event_id, person_id, response, responded_at)
                   VALUES (%s, %s, %s, %s, CASE WHEN %s <> 'PENDING' THEN now() END)""",
                self.tid(tenant),
                eid,
                self.who(name, tenant),
                response,
                response,
            )

    def calendar(self):
        mon = dt.datetime.combine(self.monday, dt.time(8, 0), VN)
        half_year = self.monday + dt.timedelta(days=182)
        quarter_end = dt.date(self.today.year, ((self.today.month - 1) // 3 + 1) * 3, 1) + dt.timedelta(days=31)
        quarter_end = quarter_end.replace(day=1) - dt.timedelta(days=1)
        h = dt.timedelta(hours=1)
        thursday = (3 - self.today.weekday()) % 7
        cds = dt.datetime.combine(self.monday, dt.time(8, 30), VN)
        self._event(
            "TDX",
            "giao-ban",
            title="Giao ban tuần Văn phòng Chuyển đổi số",
            location="Phòng họp tầng 5",
            starts=cds,
            ends=cds + h,
            recurrence="WEEKLY",
            until=self.monday + dt.timedelta(days=180),
            unit="TDX_CDS",
            organizer="cdo",
            reminder=15,
        )
        self._event(
            "TDX",
            "giao-ban-btgd",
            title="Giao ban Ban Tổng giám đốc",
            location="Phòng họp tầng 12",
            starts=mon,
            ends=mon + 1.5 * h,
            recurrence="WEEKLY",
            until=half_year,
            unit="TDX",
            organizer="tgd",
            reminder=15,
        )
        self._event(
            "TDX",
            "giao-ban-dt",
            title="Giao ban Công ty Điện thoại X",
            location="Phòng họp A, Bắc Giang",
            starts=mon + dt.timedelta(days=1, hours=0.5),
            ends=mon + dt.timedelta(days=1, hours=1.5),
            recurrence="WEEKLY",
            until=half_year,
            unit="DT",
            organizer="gd.dienthoai",
            reminder=15,
        )
        safety = dt.datetime.combine(self.monday.replace(day=1), dt.time(14, 0), VN)
        self._event(
            "TDX",
            "an-toan-phong-sach",
            title="Kiểm tra an toàn phòng sạch hằng tháng",
            kind="WORK",
            location="Phòng sạch CR-01 → CR-04",
            starts=safety,
            ends=safety + 3 * h,
            recurrence="MONTHLY",
            until=half_year,
            unit="CHIP_PS",
            organizer="qd.phongsach.chip",
            reminder=60,
        )
        self._event(
            "TDX",
            "su-co-cr02",
            title="Xử lý sự cố chênh áp CR-02",
            kind="WORK",
            location="Phòng sạch CR-02",
            description="Kiểm tra air-shower, bộ lọc HEPA số 3; đo lại hạt bụi sau khi khắc phục.",
            starts=self.at(0, 15),
            ends=self.at(0, 17),
            unit="CHIP_PS",
            organizer="qd.phongsach.chip",
            attendees={"pgd.chip": "ACCEPTED"},
            reminder=30,
        )
        self._event(
            "TDX",
            "cong-tac-singapore",
            title="Công tác Singapore: đối tác wafer",
            kind="TRIP",
            location="Singapore",
            starts=self.at(-2, 0),
            ends=self.at(3, 0),
            all_day=True,
            organizer="gd.chip",
            description="Ủy quyền duyệt cho Phó giám đốc Vũ Thị Lan trong thời gian đi.",
        )
        self._event(
            "TDX",
            "duyet-650",
            title="Họp duyệt đề nghị 650 triệu (Điện thoại X)",
            location="Phòng họp tầng 12",
            description="Đề nghị mua linh kiện quý IV; xem bảng so sánh giá của phòng Mua hàng.",
            starts=self.at(thursday, 14),
            ends=self.at(thursday, 15, 30),
            organizer="tgd",
            reminder=30,
            attendees={
                "gd.dienthoai": "ACCEPTED",
                "gd.taichinh": "ACCEPTED",
                "pho.tgd": "PENDING",
                "tp.muahang.dienthoai": "TENTATIVE",
            },
        )
        self._event(
            "TDX",
            "dao-tao-bamboo-dt",
            title="Đào tạo người dùng Bamboo: Điện thoại X",
            location="https://meet.tapdoanx.vn/dao-tao-bamboo",
            starts=self.at(1, 9),
            ends=self.at(1, 11),
            organizer="cdo",
            reminder=30,
            attendees={
                "nv.muahang.dienthoai": "ACCEPTED",
                "tp.muahang.dienthoai": "ACCEPTED",
                "ns.dienthoai": "PENDING",
                "nv3.muahang.dienthoai": "DECLINED",
            },
        )
        self._event(
            "TDX",
            "nghi-phep-pm",
            title="Nghỉ phép",
            kind="LEAVE",
            starts=self.at(8, 0),
            ends=self.at(9, 0),
            all_day=True,
            organizer="nv.phanmem.dienthoai",
        )
        self._event(
            "TDX",
            "dieu-chuyen-q4",
            title="Rà soát hồ sơ điều chuyển quý IV",
            location="Khối Nhân sự",
            starts=self.at(2, 10),
            ends=self.at(2, 11),
            organizer="gd.nhansu.tapdoan",
            reminder=15,
            attendees={"tp.nhansu.dienthoai": "ACCEPTED", "tp.phanmem.dienthoai": "ACCEPTED"},
        )
        qend = dt.datetime.combine(quarter_end, dt.time(9, 0), VN)
        self._event(
            "TDX",
            "danh-gia-quy",
            title="Đánh giá KPI và ngân sách quý",
            location="Phòng họp tầng 12",
            starts=qend,
            ends=qend + 3 * h,
            unit="TDX",
            organizer="gd.taichinh",
            reminder=1440,
        )
        self._event(
            "TDX",
            "han-bao-cao-thue",
            title="Hạn nộp báo cáo thuế quý",
            kind="DEADLINE",
            starts=dt.datetime.combine(quarter_end + dt.timedelta(days=30), dt.time(0), VN),
            ends=dt.datetime.combine(quarter_end + dt.timedelta(days=31), dt.time(0), VN),
            all_day=True,
            unit="TDX_TC",
            organizer="gd.taichinh",
        )
        self._event(
            "TDX",
            "duyet-thiet-ke",
            title="Rà soát tiến độ thí điểm DX-2027",
            location="Phòng họp tầng 5",
            starts=self.at(-4, 14),
            ends=self.at(-4, 15, 30),
            organizer="cdo",
            attendees={"admin": "ACCEPTED", "tp.muahang.dienthoai": "ACCEPTED"},
        )
        fri = dt.datetime.combine(self.monday + dt.timedelta(days=4), dt.time(13, 30), VN)
        self._event(
            "BVX",
            "hoi-dong-tbyt",
            title="Họp Hội đồng thiết bị y tế",
            location="Phòng giao ban bệnh viện",
            starts=fri,
            ends=fri + 1.5 * h,
            recurrence="WEEKLY",
            until=half_year,
            unit="BVX",
            organizer="gd.benhvien",
            reminder=30,
        )
        self._event(
            "BVX",
            "giao-ban-cdha",
            title="Giao ban khoa Chẩn đoán hình ảnh",
            location="Khoa CĐHA",
            starts=dt.datetime.combine(self.monday, dt.time(7, 30), VN),
            ends=dt.datetime.combine(self.monday, dt.time(8, 0), VN),
            recurrence="DAILY",
            until=self.monday + dt.timedelta(days=60),
            unit="BVX_CDHA",
            organizer="bs.cdha.benhvien",
        )

    def _project(self, tenant: str, code: str, spec: dict, plan: list[tuple], reports: list[dict]):
        """plan: (khóa, cha, tên, ngày bắt đầu sau đầu dự án, số ngày, mốc, %, phụ trách, [việc trước])."""
        pid = uid(tenant, "project", code)
        start = self.today + dt.timedelta(days=spec["start"])
        if not self.exists("pm.project", pid):
            manager = self.who(spec["manager"], tenant)
            conv = uid(tenant, "conversation", code)
            self.x(
                """INSERT INTO chat.conversation (tenant_id, id, kind, title, created_by) VALUES (%s, %s, 'GROUP', %s, %s)
                   ON CONFLICT DO NOTHING""",
                self.tid(tenant),
                conv,
                f"Dự án {code}: {spec['name']}"[:120],
                manager,
            )
            self.x(
                """INSERT INTO pm.project (tenant_id, id, code, name, org_unit_id, manager_id, status, start_date,
                       end_date, budget, objective, scope, deliverables, approach, risks, stakeholders, conversation_id,
                       created_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                self.tid(tenant),
                pid,
                code,
                spec["name"],
                self.unit(tenant, spec["unit"]),
                manager,
                spec["status"],
                start,
                start + dt.timedelta(days=spec["days"]),
                spec.get("budget"),
                spec.get("objective"),
                spec.get("scope"),
                spec.get("deliverables"),
                spec.get("approach"),
                spec.get("risks"),
                spec.get("stakeholders"),
                conv,
                manager,
            )
            team = [(spec["manager"], "MANAGER"), *((m, "MEMBER") for m in spec.get("members", ()))]
            team += [(m, "VIEWER") for m in spec.get("viewers", ())]
            for name, role in team:
                person = self.who(name, tenant)
                self.x(
                    "INSERT INTO pm.member (tenant_id, project_id, person_id, role) VALUES (%s, %s, %s, %s)",
                    self.tid(tenant),
                    pid,
                    person,
                    role,
                )
                self.x(
                    """INSERT INTO chat.member (tenant_id, conversation_id, person_id, role) VALUES (%s, %s, %s, %s)
                       ON CONFLICT (conversation_id, person_id) DO UPDATE SET role = EXCLUDED.role, left_at = NULL""",
                    self.tid(tenant),
                    conv,
                    person,
                    "OWNER" if role == "MANAGER" else "MEMBER",
                )
            ids = {k: uid(tenant, "pm_task", code, k) for k, *_ in plan}
            for seq, (key, parent, name, offset, days, milestone, progress, owner, _after) in enumerate(plan, start=1):
                first = start + dt.timedelta(days=offset)
                last = first if milestone else first + dt.timedelta(days=max(days, 1) - 1)
                self.x(
                    """INSERT INTO pm.task (tenant_id, id, project_id, parent_id, seq, name, start_date, end_date,
                           milestone, progress, assignee_id, baseline_start, baseline_end)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    self.tid(tenant),
                    ids[key],
                    pid,
                    ids[parent] if parent else None,
                    seq,
                    name,
                    first,
                    last,
                    milestone,
                    progress,
                    self.who(owner, tenant) if owner else None,
                    first,
                    last,
                )
            for key, *_rest, after in plan:
                for pred in after:
                    self.x(
                        """INSERT INTO pm.dependency (tenant_id, project_id, predecessor_id, successor_id)
                           VALUES (%s, %s, %s, %s)""",
                        self.tid(tenant),
                        pid,
                        ids[pred],
                        ids[key],
                    )
            self.x(
                """UPDATE pm.task g SET start_date = c.s, end_date = c.e, baseline_start = c.s, baseline_end = c.e
                   FROM (SELECT parent_id, min(start_date) s, max(end_date) e FROM pm.task WHERE project_id = %s
                         AND parent_id IS NOT NULL GROUP BY parent_id) c WHERE g.id = c.parent_id""",
                pid,
            )
            for key, days in spec.get("slips", {}).items():
                self.x("UPDATE pm.task SET end_date = end_date + %s WHERE id = %s", days, ids[key])
            self.x("UPDATE pm.project SET baseline_at = now() - interval '20 days' WHERE id = %s", pid)
        for r in reports:
            self._report(tenant, code, pid, start, spec["manager"], r)

    def _report(self, tenant: str, code: str, pid, start: dt.date, manager: str, r: dict):
        rid = uid(tenant, "pm_report", code, str(r["to"]))
        if self.exists("pm.report", rid):
            return
        until = self.today + dt.timedelta(days=r["to"])
        s = self.x("SELECT actual_pct, planned_pct, spi, late_tasks FROM pm.stats(%s, %s)", pid, until).fetchone()
        snapshot = [
            {
                "wbs": str(i),
                "name": n,
                "start_date": a.isoformat(),
                "end_date": b.isoformat(),
                "progress": p,
                "assignee": who,
                "late": p < 100 and b < until,
                "milestone": m,
                "level": 1 if par else 0,
            }
            for i, (n, a, b, p, who, m, par) in enumerate(
                self.x(
                    """SELECT t.name, t.start_date, t.end_date, t.progress, pe.full_name, t.milestone, t.parent_id
                       FROM pm.task t LEFT JOIN core.person pe ON pe.id = t.assignee_id
                       WHERE t.project_id = %s ORDER BY t.seq""",
                    pid,
                ).fetchall(),
                start=1,
            )
        ]
        self.x(
            """INSERT INTO pm.report (tenant_id, id, project_id, period_from, period_to, health, summary, accomplishments,
                   next_steps, issues, planned_pct, actual_pct, spi, late_tasks, snapshot, created_by, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            self.tid(tenant),
            rid,
            pid,
            until - dt.timedelta(days=6),
            until,
            r["health"],
            r["summary"],
            r.get("done"),
            r.get("next"),
            r.get("issues"),
            s[1],
            s[0],
            s[2],
            s[3],
            json.dumps(snapshot, ensure_ascii=False),
            self.who(manager, tenant),
            dt.datetime.combine(until, dt.time(17, 0), VN),
        )

    def projects(self):
        monday_offset = -(self.today.weekday() + 28)
        self._project(
            "TDX",
            "DX-2027",
            {
                "name": "Triển khai nền tảng DX-OS toàn tập đoàn",
                "unit": "TDX_CDS",
                "manager": "cdo",
                "members": ["admin", "tp.muahang.dienthoai", "nv.muahang.dienthoai", "ns.dienthoai"],
                "viewers": ["tgd"],
                "status": "ACTIVE",
                "start": monday_offset,
                "days": 125,
                "budget": 2_500_000_000,
                "objective": "Đưa toàn bộ phê duyệt, mua sắm, nhân sự của ba công ty con lên một nền tảng; 100% đề nghị "
                "mua sắm lập và duyệt trên hệ thống; thời gian duyệt trung bình dưới 2 ngày.",
                "scope": "Phê duyệt, mua sắm, đơn hàng nội bộ, nhân sự, thư viện tri thức, trung tâm điều hành. Không gồm "
                "kế toán tổng hợp và lương.",
                "deliverables": "Hệ thống chạy thật tại Chip X, Điện thoại X, Gia dụng X; tài liệu hướng dẫn; 300 người "
                "dùng được đào tạo; biên bản nghiệm thu từng giai đoạn.",
                "approach": "Ba giai đoạn: khảo sát và thiết kế, thí điểm tại Điện thoại X, nhân rộng. Mỗi công ty con cử "
                "một đầu mối; Văn phòng Chuyển đổi số chủ trì.",
                "risks": "Dữ liệu danh mục cũ thiếu chuẩn → làm sạch trước khi nhập.\nNgười dùng ngại thay đổi → đào tạo "
                "theo nhóm, hỗ trợ tại chỗ hai tuần đầu.\nHạ tầng chưa đủ → triển khai trên máy chủ 8 GB, giám sát tải.",
                "stakeholders": "Ban Tổng giám đốc (phê duyệt), giám đốc ba công ty con, Khối Tài chính, Khối Nhân sự.",
                "slips": {"D": 5},
            },
            [
                ("G1", None, "Khảo sát và thiết kế", 0, 0, False, 0, None, []),
                ("A", "G1", "Khảo sát quy trình ba công ty con", 0, 10, False, 100, "admin", []),
                ("B", "G1", "Thiết kế giải pháp và phân quyền", 11, 10, False, 100, "cdo", ["A"]),
                ("M1", "G1", "Ban Tổng giám đốc duyệt thiết kế", 21, 0, True, 100, "cdo", ["B"]),
                ("G2", None, "Thí điểm tại Điện thoại X", 0, 0, False, 0, None, []),
                ("C", "G2", "Cấu hình cơ cấu tổ chức, chuỗi duyệt", 22, 12, False, 70, "tp.muahang.dienthoai", ["M1"]),
                ("D", "G2", "Nhập danh mục và dữ liệu chủ", 22, 15, False, 40, "nv.muahang.dienthoai", ["M1"]),
                ("E", "G2", "Đào tạo người dùng thí điểm", 38, 8, False, 0, "ns.dienthoai", ["C", "D"]),
                ("M2", "G2", "Nghiệm thu thí điểm", 47, 0, True, 0, "cdo", ["E"]),
                ("G3", None, "Nhân rộng toàn tập đoàn", 0, 0, False, 0, None, []),
                ("F", "G3", "Triển khai Chip X và Gia dụng X", 48, 40, False, 0, "admin", ["M2"]),
                ("G", "G3", "Tổng kết và bàn giao vận hành", 89, 10, False, 0, "cdo", ["F"]),
                ("M3", None, "Vận hành chính thức", 100, 0, True, 0, "cdo", ["G"]),
            ],
            [
                {
                    "to": -14,
                    "health": "GREEN",
                    "summary": "Hoàn tất khảo sát ba công ty con, thiết kế đang đúng kế hoạch.",
                    "done": "Khảo sát 42 quy trình; phác thảo phân quyền theo vị trí.",
                    "next": "Trình Ban Tổng giám đốc duyệt thiết kế.",
                },
                {
                    "to": -1,
                    "health": "AMBER",
                    "summary": "Thí điểm Điện thoại X chậm khoảng 5 ngày ở phần nhập danh mục.",
                    "done": "Thiết kế được duyệt; cấu hình xong chuỗi duyệt mua sắm.",
                    "issues": "Danh mục nhà cung cấp cũ trùng lặp 18%, cần làm sạch thủ công.",
                    "next": "Bổ sung một người làm sạch dữ liệu; đào tạo thí điểm tuần sau.",
                },
            ],
        )
        self._project(
            "TDX",
            "CHIP-CR02",
            {
                "name": "Nâng cấp phòng sạch CR-02 lên ISO 5 ổn định",
                "unit": "CHIP_PS",
                "manager": "qd.phongsach.chip",
                "members": ["pgd.chip", "kd.chip"],
                "viewers": ["gd.chip"],
                "status": "ACTIVE",
                "start": -35,
                "days": 75,
                "budget": 1_800_000_000,
                "objective": "Giữ chênh áp CR-02 ≥ 12 Pa và hạt bụi ≥0,5 µm dưới 3.000/m³ liên tục 30 ngày.",
                "scope": "Thay bộ lọc HEPA, nâng cấp air-shower, lắp cảm biến chênh áp dự phòng, máy đếm hạt bụi mới.",
                "risks": "Phải dừng sản xuất CR-02 khi thay lọc → làm vào cuối tuần.\nThiết bị nhập khẩu giao chậm.",
                "slips": {"C2": 6},
            },
            [
                ("A", None, "Đánh giá hiện trạng và đo kiểm", 0, 7, False, 100, "qd.phongsach.chip", []),
                ("B", None, "Mua sắm thiết bị", 0, 0, False, 0, None, []),
                ("B1", "B", "Đề nghị mua máy đếm hạt bụi", 8, 5, False, 100, "qd.phongsach.chip", ["A"]),
                ("B2", "B", "Đặt hàng bộ lọc HEPA và air-shower", 8, 20, False, 60, "pgd.chip", ["A"]),
                ("C", None, "Thi công", 0, 0, False, 0, None, []),
                ("C1", "C", "Thay bộ lọc HEPA (cuối tuần)", 29, 3, False, 30, "qd.phongsach.chip", ["B2"]),
                ("C2", "C", "Nâng cấp air-shower và cửa", 33, 10, False, 0, "qd.phongsach.chip", ["C1"]),
                ("D", None, "Đo xác nhận 30 ngày", 44, 30, False, 0, "qd.phongsach.chip", ["C2"]),
                ("M", None, "Nghiệm thu ISO 5", 75, 0, True, 0, "gd.chip", ["D"]),
            ],
            [
                {
                    "to": -1,
                    "health": "RED",
                    "summary": "Sự cố chênh áp CR-02 tái diễn; thi công air-shower trễ 6 ngày.",
                    "issues": "Air-shower nhập khẩu giao chậm; CR-02 vượt ngưỡng hạt bụi hai lần trong tuần.",
                    "next": "Thuê thiết bị tạm; đề nghị máy đếm hạt bụi mới đang chờ duyệt.",
                },
            ],
        )
        self._project(
            "TDX",
            "DT-SMT4",
            {
                "name": "Lắp đặt dây chuyền SMT số 4 tại Bắc Giang",
                "unit": "DT",
                "manager": "gd.dienthoai",
                "members": ["tp.muahang.dienthoai", "tp.phanmem.dienthoai"],
                "status": "PLANNING",
                "start": 21,
                "days": 120,
                "budget": 12_000_000_000,
                "objective": "Tăng 30% công suất lắp ráp bo mạch điện thoại từ quý sau.",
                "scope": "Nhà xưởng, máy SMT, lò reflow, AOI, phần mềm điều khiển; tuyển 12 kỹ thuật viên.",
            },
            [
                ("A", None, "Chọn nhà cung cấp thiết bị", 0, 20, False, 0, "tp.muahang.dienthoai", []),
                ("B", None, "Cải tạo nhà xưởng", 10, 40, False, 0, "gd.dienthoai", []),
                ("C", None, "Lắp đặt và chạy thử", 51, 30, False, 0, "tp.phanmem.dienthoai", ["A", "B"]),
                ("M", None, "Bàn giao sản xuất", 85, 0, True, 0, "gd.dienthoai", ["C"]),
            ],
            [],
        )
        self._project(
            "TDX",
            "GD-BH",
            {
                "name": "Chuẩn hóa quy trình bảo hành Gia dụng X",
                "unit": "GD_BH",
                "manager": "gd.baohanh.giadung",
                "members": ["hopdong"],
                "status": "DONE",
                "start": -80,
                "days": 60,
                "objective": "Thời gian xử lý bảo hành dưới 5 ngày cho 90% phiếu.",
            },
            [
                ("A", None, "Khảo sát phiếu bảo hành 12 tháng", 0, 10, False, 100, "hopdong", []),
                ("B", None, "Thiết kế quy trình mới", 11, 15, False, 100, "gd.baohanh.giadung", ["A"]),
                ("C", None, "Áp dụng thử 3 trung tâm", 27, 25, False, 100, "hopdong", ["B"]),
                ("M", None, "Ban hành quy trình", 55, 0, True, 100, "gd.baohanh.giadung", ["C"]),
            ],
            [
                {
                    "to": -20,
                    "health": "GREEN",
                    "summary": "Hoàn thành: 92% phiếu xử lý dưới 5 ngày.",
                    "done": "Quy trình bảo hành mới ban hành toàn công ty.",
                },
            ],
        )
        self._project(
            "BVX",
            "BVX-EMR",
            {
                "name": "Số hóa hồ sơ bệnh án điện tử",
                "unit": "BVX",
                "manager": "gd.benhvien",
                "members": ["bs.cdha.benhvien", "tk.duoc.benhvien", "tp.khth.benhvien"],
                "status": "ACTIVE",
                "start": -30,
                "days": 150,
                "budget": 3_200_000_000,
                "objective": "100% bệnh án nội trú lập và ký trên hệ thống; kết nối PACS của khoa Chẩn đoán hình ảnh.",
                "scope": "Khoa Nội, khoa Chẩn đoán hình ảnh, khoa Dược thí điểm trước; các khoa còn lại giai đoạn 2.",
            },
            [
                ("A", None, "Chuẩn hóa mẫu bệnh án", 0, 20, False, 100, "tp.khth.benhvien", []),
                ("B", None, "Kết nối PACS khoa CĐHA", 15, 30, False, 55, "bs.cdha.benhvien", []),
                ("C", None, "Đơn thuốc điện tử khoa Dược", 21, 25, False, 50, "tk.duoc.benhvien", ["A"]),
                ("D", None, "Thí điểm khoa Nội", 50, 40, False, 0, "tp.khth.benhvien", ["B", "C"]),
                ("M", None, "Nghiệm thu giai đoạn 1", 95, 0, True, 0, "gd.benhvien", ["D"]),
            ],
            [
                {
                    "to": -2,
                    "health": "GREEN",
                    "summary": "Đúng kế hoạch; PACS đã kết nối thử 2/4 máy.",
                    "next": "Kết nối máy siêu âm 4D mới khi đề nghị mua được duyệt.",
                },
            ],
        )

    def api_keys(self):
        """Hai khóa mẫu của Tập đoàn X do `cdo` tạo (chỉ lưu SHA-256 của chuỗi ngẫu nhiên, không dùng được để gọi)."""
        creator = self.who("cdo")
        tdx = self.tid("TDX")
        keys = [
            (
                "kho-bi",
                "Kho dữ liệu BI của Khối Tài chính",
                ["metrics.read", "kpi.read", "datasets.read"],
                70,
                None,
                120,
            ),
            ("ncc", "Cổng thông tin nhà cung cấp (cũ)", ["org.read"], 120, 10, 15),
        ]
        for key, name, scopes, age, revoked_ago, daily in keys:
            kid = uid("TDX", "api_key", key)
            if self.exists("api.api_key", kid):
                continue
            self.x(
                """INSERT INTO api.api_key (tenant_id, id, name, prefix, key_sha256, scopes, created_by, created_at,
                       expires_at, revoked_at, revoked_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, now() - make_interval(days => %s),
                           now() - make_interval(days => %s) + interval '365 days',
                           CASE WHEN %s::int IS NULL THEN NULL ELSE now() - make_interval(days => %s::int) END,
                           CASE WHEN %s::int IS NULL THEN NULL ELSE %s::uuid END)""",
                tdx,
                kid,
                name,
                "bak_" + hashlib.sha256(key.encode()).hexdigest()[:6],
                hashlib.sha256(f"demo:{key}".encode()).digest(),
                scopes,
                creator,
                age,
                age,
                revoked_ago,
                revoked_ago,
                revoked_ago,
                creator,
            )
            last = revoked_ago or 0
            for d in range(min(age, 30), last - 1, -1):
                calls = daily + (d * 37) % (daily // 2 + 1) if d % 7 not in (5, 6) else daily // 5
                self.x(
                    """INSERT INTO api.usage (key_id, day, calls, errors, last_used_at, last_ip)
                       VALUES (%s, current_date - %s, %s, %s,
                               now() - make_interval(days => %s, hours => 2), %s)""",
                    kid,
                    d,
                    calls,
                    (d * 13) % 4 if d % 5 == 0 else 0,
                    d,
                    "10.20.4.15" if key == "kho-bi" else "203.0.113.45",
                )
