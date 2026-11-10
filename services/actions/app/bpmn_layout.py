# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Bố cục tự động cho sơ đồ BPMN: xếp phần tử theo cột (thứ tự luồng) và làn (người thực hiện), rồi vẽ đường nối vuông góc.

Mọi tọa độ nằm trên lưới 10 px nên hai đường nối chỉ trùng nhau khi cùng một tọa độ. Đường nối được tìm bằng Dijkstra
trên lưới thưa (phạt mỗi chỗ gấp khúc và mỗi chỗ cắt ngang), đã vẽ đường nào thì đường sau không được đi chồng lên, không
chạm vào góc hay đầu mút của nó, và không xuyên qua phần tử hay nhãn. Cổng nối (port) của mỗi cạnh phần tử được chia chỗ
riêng nên nhiều luồng vào cùng một việc không dồn về một điểm.
"""

import heapq
import itertools
import time
from collections import defaultdict
from dataclasses import dataclass, field

COLW = 260
ROW_H = 160
LABEL_W = 30
POOL_X = 20
LANE_Y0 = 20
X0 = POOL_X + LABEL_W + 120
SIZES = {"start": (36, 36), "end": (36, 36), "task": (180, 80), "gateway": (50, 50)}
MARGIN = 6
BEND = 40
CROSS = 70
TURN_PORT = 12
TIME_BUDGET = 8.0
DIRS = ((1, 0), (0, 1), (-1, 0), (0, -1))
SLOTS_TASK_H = (0, -20, 20)
SLOTS_TASK_V = (0, -30, 30)
GAP_X = (-30, -20, -10, 0, 10, 20, 30)
GAP_Y = (-30, -20, -10, 0, 10, 20, 30)


@dataclass
class Node:
    id: str
    kind: str
    name: str = ""
    lane: str | None = None


@dataclass
class Edge:
    id: str
    src: str
    tgt: str
    name: str = ""


@dataclass
class Layout:
    shapes: dict[str, tuple[int, int, int, int]] = field(default_factory=dict)
    node_labels: dict[str, tuple[int, int, int, int]] = field(default_factory=dict)
    routes: dict[str, list[tuple[int, int]]] = field(default_factory=dict)
    edge_labels: dict[str, tuple[int, int, int, int]] = field(default_factory=dict)
    lanes: list[tuple[str, int, int]] = field(default_factory=list)
    width: int = 0
    height: int = 0
    unrouted: list[str] = field(default_factory=list)


def _round10(v: float) -> int:
    return round(v / 10.0) * 10


def _text_width(text: str, per_char: float = 6.4, pad: int = 8) -> int:
    return int(len(text) * per_char) + pad


def _assign_grid(nodes: list[Node], edges: list[Edge], start_id: str):
    """Cột theo thứ tự luồng (bỏ cạnh quay lui), dòng con trong làn sao cho luồng chính nằm cùng một dòng."""
    order = {n.id: i for i, n in enumerate(nodes)}
    out: dict[str, list[Edge]] = defaultdict(list)
    for e in edges:
        out[e.src].append(e)

    state: dict[str, int] = {}
    back: set[str] = set()
    for root in [start_id] + [n.id for n in nodes]:
        if root in state:
            continue
        state[root] = 1
        stack = [(root, iter(out[root]))]
        while stack:
            u, it = stack[-1]
            for e in it:
                s = state.get(e.tgt, 0)
                if s == 1:
                    back.add(e.id)
                elif s == 0:
                    state[e.tgt] = 1
                    stack.append((e.tgt, iter(out[e.tgt])))
                    break
            else:
                state[u] = 2
                stack.pop()

    fwd = [e for e in edges if e.id not in back]
    preds: dict[str, list[Edge]] = defaultdict(list)
    for e in fwd:
        preds[e.tgt].append(e)
    indeg = {n.id: len(preds[n.id]) for n in nodes}
    ready = [(order[n.id], n.id) for n in nodes if indeg[n.id] == 0]
    heapq.heapify(ready)
    topo: list[str] = []
    succ: dict[str, list[Edge]] = defaultdict(list)
    for e in fwd:
        succ[e.src].append(e)
    while ready:
        _, u = heapq.heappop(ready)
        topo.append(u)
        for e in succ[u]:
            indeg[e.tgt] -= 1
            if indeg[e.tgt] == 0:
                heapq.heappush(ready, (order[e.tgt], e.tgt))

    lane_of = {n.id: n.lane for n in nodes}
    col: dict[str, int] = {}
    sub: dict[str, int] = {}
    taken: set[tuple[str | None, int, int]] = set()
    for v in topo:
        ps = preds[v]
        col[v] = max((col[e.src] + 1 for e in ps), default=0)
        pref = 0
        if ps:
            e = ps[0]
            p = e.src
            primary = succ[p][0].id == e.id
            if lane_of[p] == lane_of[v]:
                pref = sub[p] if primary else sub[p] + 1
        s = pref
        while (lane_of[v], col[v], s) in taken:
            s += 1
        taken.add((lane_of[v], col[v], s))
        sub[v] = s
    return col, sub, back


def layout(nodes: list[Node], edges: list[Edge], start_id: str) -> Layout:
    col, sub, back = _assign_grid(nodes, edges, start_id)
    lanes: list[str | None] = []
    for n in nodes:
        if n.lane not in lanes:
            lanes.append(n.lane)
    nsub = {ln: 1 + max((sub[n.id] for n in nodes if n.lane == ln), default=0) for ln in lanes}
    top: dict[str | None, int] = {}
    y = LANE_Y0
    for ln in lanes:
        top[ln] = y
        y += nsub[ln] * ROW_H
    height = y + 20
    ncols = 1 + max(col.values(), default=0)

    result = Layout()
    result.width = X0 + (ncols - 1) * COLW + 130 + 40
    result.height = height
    result.lanes = [(ln or "", top[ln], nsub[ln] * ROW_H) for ln in lanes if ln is not None]

    by_id = {n.id: n for n in nodes}
    center: dict[str, tuple[int, int]] = {}
    rects: dict[str, tuple[int, int, int, int]] = {}
    obstacles: list[tuple] = []
    for n in nodes:
        w, h = SIZES[n.kind]
        cx = X0 + col[n.id] * COLW
        cy = top[n.lane] + sub[n.id] * ROW_H + ROW_H // 2
        center[n.id] = (cx, cy)
        rects[n.id] = (cx - w // 2, cy - h // 2, w, h)
        result.shapes[n.id] = rects[n.id]
        obstacles.append((cx - w / 2 - MARGIN, cy - h / 2 - MARGIN, cx + w / 2 + MARGIN, cy + h / 2 + MARGIN, n.id))
        if n.kind in ("start", "end") and n.name:
            lw = max(60, min(140, _text_width(n.name)))
            lab = (cx - lw // 2, cy + h // 2 + 4, lw, 28)
            result.node_labels[n.id] = lab
            obstacles.append((lab[0] - 2, lab[1] - 2, lab[0] + lab[2] + 2, lab[1] + lab[3] + 2, None))
        elif n.kind == "gateway" and n.name:
            lw = max(40, min(120, _text_width(n.name)))
            lab = (cx - 25 - lw - 4, cy - 25 - 18, lw, 16)
            result.node_labels[n.id] = lab
            obstacles.append((lab[0] - 2, lab[1] - 2, lab[0] + lab[2] + 2, lab[1] + lab[3] + 2, None))

    router = _Router(nodes, center, ncols, top, nsub, lanes, obstacles, result.width, height)
    router.deadline = time.monotonic() + TIME_BUDGET
    ordered = sorted(
        edges,
        key=lambda e: (
            e.id in back,
            abs(col[e.tgt] - col[e.src])
            + abs(sub[e.tgt] - sub[e.src])
            + (lanes.index(by_id[e.tgt].lane) != lanes.index(by_id[e.src].lane)),
        ),
    )
    for e in ordered:
        path = router.route(by_id[e.src], by_id[e.tgt])
        if path is None:
            result.unrouted.append(e.id)
            (sx, sy), (tx, ty) = center[e.src], center[e.tgt]
            path = [(sx, sy), (tx, sy), (tx, ty)]
        result.routes[e.id] = path
    placed: list[tuple[int, int, int, int]] = []
    for e in edges:
        if e.name:
            rect = _edge_label(result.routes[e.id], e.name, result.routes, obstacles, placed)
            result.edge_labels[e.id] = rect
            placed.append(rect)
    return result


def _edge_label(
    path: list[tuple[int, int]],
    text: str,
    routes: dict[str, list[tuple[int, int]]],
    obstacles: list[tuple],
    placed: list[tuple[int, int, int, int]],
) -> tuple[int, int, int, int]:
    """Nhãn đặt sát đầu luồng, né mọi đường nối, phần tử và nhãn đã đặt; không có chỗ sạch thì lấy chỗ gần đầu nhất."""
    lw = max(36, min(150, _text_width(text)))
    segs = list(itertools.pairwise(path))

    def clear(r: tuple[int, int, int, int]) -> bool:
        x, y, w, h = r
        for pts in routes.values():
            for (x1, y1), (x2, y2) in itertools.pairwise(pts):
                if min(x1, x2) - 1 < x + w and max(x1, x2) + 1 > x and min(y1, y2) - 1 < y + h and max(y1, y2) + 1 > y:
                    return False
        if any(x < o[2] and x + w > o[0] and y < o[3] and y + h > o[1] for o in obstacles):
            return False
        return not any(x < px + pw and x + w > px and y < py + ph and y + h > py for px, py, pw, ph in placed)

    candidates: list[tuple[int, int, int, int]] = []
    for (x1, y1), (x2, y2) in segs:
        if y1 == y2 and abs(x2 - x1) >= lw + 12:
            lo, hi = min(x1, x2), max(x1, x2)
            xs = [lo + 8, (lo + hi - lw) // 2, hi - lw - 8]
            if x2 < x1:
                xs.reverse()
            candidates += [(x, y1 - 20, lw, 16) for x in xs] + [(x, y1 + 4, lw, 16) for x in xs]
        elif x1 == x2 and abs(y2 - y1) >= 24:
            lo, hi = min(y1, y2), max(y1, y2)
            ys = [lo + 6, (lo + hi - 16) // 2, hi - 22]
            if y2 < y1:
                ys.reverse()
            candidates += [(x1 + 6, y, lw, 16) for y in ys] + [(x1 - 6 - lw, y, lw, 16) for y in ys]
    for r in candidates:
        if clear(r):
            return r
    return candidates[0] if candidates else (path[0][0] + 4, path[0][1] - 20, lw, 16)


class _Router:
    def __init__(self, nodes, center, ncols, top, nsub, lanes, obstacles, width, height):
        self.center = center
        self.obstacles = obstacles
        xs: set[int] = set()
        ys: set[int] = set()
        for k in range(-1, ncols + 1):
            gx = X0 + k * COLW + COLW // 2
            xs.update(gx + o for o in GAP_X)
        bounds = {top[ln] for ln in lanes} | {top[ln] + nsub[ln] * ROW_H for ln in lanes}
        for ln in lanes:
            for s in range(nsub[ln]):
                cy = top[ln] + s * ROW_H + ROW_H // 2
                ys.update(cy + o for o in (-20, -10, 0, 10, 20))
            for s in range(nsub[ln] + 1):
                gy = top[ln] + s * ROW_H
                ys.update(gy + o for o in GAP_Y if not (gy in bounds and o == 0))
        self.ports: dict[tuple[str, str], list[tuple[int, int, int]]] = {}
        self.used_slots: dict[tuple[str, str], int] = defaultdict(int)
        for n in nodes:
            cx, cy = center[n.id]
            w, h = SIZES[n.kind]
            hw, hh = w // 2, h // 2
            ax, ay = _round10(hw + 20), _round10(hh + 20)
            sl_h = SLOTS_TASK_H if n.kind == "task" else (0,)
            sl_v = SLOTS_TASK_V if n.kind == "task" else (0,)
            self.ports[(n.id, "R")] = [(cx + hw, cy + o, ax - hw) for o in sl_h]
            self.ports[(n.id, "L")] = [(cx - hw, cy + o, ax - hw) for o in sl_h]
            self.ports[(n.id, "B")] = [(cx + o, cy + hh, ay - hh) for o in sl_v]
            self.ports[(n.id, "T")] = [(cx + o, cy - hh, ay - hh) for o in sl_v]
            xs.update([cx - hw, cx + hw, cx - ax, cx + ax, cx])
            ys.update([cy - hh, cy + hh, cy - ay, cy + ay, cy])
            xs.update(cx + o for o in sl_v)
            ys.update(cy + o for o in sl_h)
            for extra in (10, 20, 30):
                xs.update([cx - ax - extra, cx + ax + extra])
                ys.update([cy - ay - extra, cy + ay + extra])
        self.xs = sorted(xs)
        self.ys = sorted(ys)
        self.xi = {x: i for i, x in enumerate(self.xs)}
        self.yi = {y: i for i, y in enumerate(self.ys)}
        self.reserved: set[tuple[int, int]] = set()
        for n in nodes:
            if n.kind == "task":
                continue
            cx, cy = center[n.id]
            w, h = SIZES[n.kind]
            ax, ay = _round10(w // 2 + 20), _round10(h // 2 + 20)
            for px, py in ((cx + ax, cy), (cx - ax, cy), (cx, cy + ay), (cx, cy - ay)):
                self.reserved.add((self.xi[px], self.yi[py]))
        self.static_h: dict[tuple[int, int], bool] = {}
        self.static_v: dict[tuple[int, int], bool] = {}
        self.occ_h: set[tuple[int, int]] = set()
        self.occ_v: set[tuple[int, int]] = set()
        self.blocked: set[tuple[int, int]] = set()
        self.inter_h: set[tuple[int, int]] = set()
        self.inter_v: set[tuple[int, int]] = set()
        self.deadline = float("inf")
        self._index()

    def _index(self) -> None:
        self._buckets: dict[int, list[tuple]] = defaultdict(list)
        for r in self.obstacles:
            for k in range(int(r[0]) // 100, int(r[2]) // 100 + 1):
                self._buckets[k].append(r)
        self._pt_cache: dict[tuple[int, int], bool] = {}

    def _hit(self, x1, y1, x2, y2, skip: str | None = None) -> bool:
        lx, hx, ly, hy = min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)
        for k in range(int(lx) // 100, int(hx) // 100 + 1):
            for r in self._buckets.get(k, ()):
                if skip is not None and r[4] == skip:
                    continue
                if lx < r[2] and hx > r[0] and ly < r[3] and hy > r[1]:
                    return True
        return False

    def _pt_in(self, x, y) -> bool:
        key = (x, y)
        hit = self._pt_cache.get(key)
        if hit is None:
            hit = any(r[0] < x < r[2] and r[1] < y < r[3] for r in self._buckets.get(int(x) // 100, ()))
            self._pt_cache[key] = hit
        return hit

    def _step_ok(self, ix: int, iy: int, d: int) -> bool:
        """Bước liền kề từ (ix, iy) theo hướng d có đi được không (không xuyên phần tử, không chồng đường khác)."""
        if d == 0 or d == 2:
            i = ix if d == 0 else ix - 1
            key = (iy, i)
            if key not in self.static_h:
                y = self.ys[iy]
                self.static_h[key] = not self._hit(self.xs[i], y, self.xs[i + 1], y)
            return self.static_h[key] and key not in self.occ_h
        i = iy if d == 1 else iy - 1
        key = (ix, i)
        if key not in self.static_v:
            x = self.xs[ix]
            self.static_v[key] = not self._hit(x, self.ys[i], x, self.ys[i + 1])
        return self.static_v[key] and key not in self.occ_v

    def _stub_ok(self, owner: str, p: tuple[int, int], q: tuple[int, int]) -> bool:
        if self._hit(p[0], p[1], q[0], q[1], skip=owner):
            return False
        for (x1, y1), (x2, y2) in ((p, q),):
            if y1 == y2:
                iy = self.yi[y1]
                a, b = sorted((self.xi[x1], self.xi[x2]))
                if any((iy, i) in self.occ_h for i in range(a, b)):
                    return False
                if any((i, iy) in self.blocked for i in range(a + 1, b)):
                    return False
            else:
                ix = self.xi[x1]
                a, b = sorted((self.yi[y1], self.yi[y2]))
                if any((ix, i) in self.occ_v for i in range(a, b)):
                    return False
                if any((ix, i) in self.blocked for i in range(a + 1, b)):
                    return False
        return True

    def _free_end(self, owner: str, port, direction, stub: int, incoming: bool) -> tuple[int, int] | None:
        """Đầu stub tự do: kéo dài thêm từng 10 px nếu điểm đầu stub đã bị đường khác chiếm."""
        for extra in (0, 10, 20, 30):
            e = (port[0] + direction[0] * (stub + extra), port[1] + direction[1] * (stub + extra))
            if e[0] not in self.xi or e[1] not in self.yi or (self.xi[e[0]], self.yi[e[1]]) in self.blocked:
                continue
            if self._pt_in(*e):
                continue
            if self._stub_ok(owner, e if incoming else port, port if incoming else e):
                return e
        return None

    def route(self, src: Node, dst: Node) -> list[tuple[int, int]] | None:
        starts = []
        for side, d in (("R", 0), ("B", 1), ("T", 3)):
            slot = self.used_slots[(src.id, side)]
            ports = self.ports[(src.id, side)]
            if slot >= len(ports):
                continue
            px, py, stub = ports[slot]
            a = self._free_end(src.id, (px, py), DIRS[d], stub, False)
            if a is None:
                continue
            starts.append((side, slot, (px, py), a, d, 0 if side == "R" else TURN_PORT))
        goals: dict[tuple[int, int], tuple[str, int, tuple[int, int], int, int]] = {}
        for side, d in (("L", 0), ("T", 1), ("B", 3)):
            slot = self.used_slots[(dst.id, side)]
            ports = self.ports[(dst.id, side)]
            if slot >= len(ports):
                continue
            qx, qy, stub = ports[slot]
            b = self._free_end(dst.id, (qx, qy), (-DIRS[d][0], -DIRS[d][1]), stub, True)
            if b is None:
                continue
            goals[(self.xi[b[0]], self.yi[b[1]])] = (side, slot, (qx, qy), d, 0 if side == "L" else TURN_PORT)
        if not starts or not goals or time.monotonic() > self.deadline:
            return None

        self._own = {(self.xi[st[3][0]], self.yi[st[3][1]]) for st in starts} | set(goals)
        pts = [st[3] for st in starts] + [(self.xs[k[0]], self.ys[k[1]]) for k in goals]
        ax_min, ax_max = min(p[0] for p in pts), max(p[0] for p in pts)
        ay_min, ay_max = min(p[1] for p in pts), max(p[1] for p in pts)
        for mx, my in ((COLW, ROW_H), (3 * COLW, 3 * ROW_H), (10**9, 10**9)):
            box = (ax_min - mx, ay_min - my, ax_max + mx, ay_max + my)
            found = self._search(starts, goals, box, src, dst)
            if found is not None:
                return found
        return None

    def _search(self, starts, goals, box, src: Node, dst: Node) -> list[tuple[int, int]] | None:
        def heuristic(ix: int, iy: int) -> int:
            x, y = self.xs[ix], self.ys[iy]
            return min(abs(self.xs[gx] - x) + abs(self.ys[gy] - y) for gx, gy in goals)

        heap: list = []
        g: dict[tuple[int, int, int], float] = {}
        parent: dict[tuple[int, int, int], tuple[int, int, int] | None] = {}
        origin: dict[tuple[int, int, int], tuple] = {}
        tick = 0
        for side, slot, p, a, d, pen in starts:
            st = (self.xi[a[0]], self.yi[a[1]], d)
            if pen < g.get(st, 1e18):
                g[st], parent[st], origin[st] = pen, None, (side, slot, p, a)
                heapq.heappush(heap, (pen + heuristic(st[0], st[1]), tick, st))
                tick += 1
        best_total, best_end = 1e18, None
        closed: set[tuple[int, int, int]] = set()
        while heap:
            f, _, st = heapq.heappop(heap)
            if f >= best_total:
                break
            if st in closed:
                continue
            closed.add(st)
            ix, iy, d = st
            cost = g[st]
            if (ix, iy) in goals:
                _, _, _, gd, pen = goals[(ix, iy)]
                if d != (gd + 2) % 4:
                    total = cost + (0 if d == gd else BEND) + pen
                    if total < best_total:
                        best_total, best_end = total, st
            x, y = self.xs[ix], self.ys[iy]
            nx, ny = ix + DIRS[d][0], iy + DIRS[d][1]
            if (
                0 <= nx < len(self.xs)
                and 0 <= ny < len(self.ys)
                and self._step_ok(ix, iy, d)
                and (
                    box[0] <= self.xs[nx] <= box[2]
                    and box[1] <= self.ys[ny] <= box[3]
                    and (nx, ny) not in self.blocked
                    and ((nx, ny) not in self.reserved or (nx, ny) in self._own)
                    and not self._pt_in(self.xs[nx], self.ys[ny])
                )
            ):
                step = abs(self.xs[nx] - x) + abs(self.ys[ny] - y)
                crossing = (nx, ny) in (self.inter_v if d % 2 == 0 else self.inter_h)
                ns = (nx, ny, d)
                nc = cost + step + (CROSS if crossing else 0)
                if nc < g.get(ns, 1e18):
                    g[ns], parent[ns] = nc, st
                    heapq.heappush(heap, (nc + heuristic(nx, ny), tick, ns))
                    tick += 1
            if (ix, iy) not in self.inter_h and (ix, iy) not in self.inter_v and (ix, iy) not in self.blocked:
                for nd in ((d + 1) % 4, (d + 3) % 4):
                    ns = (ix, iy, nd)
                    nc = cost + BEND
                    if nc < g.get(ns, 1e18):
                        g[ns], parent[ns] = nc, st
                        heapq.heappush(heap, (nc + heuristic(ix, iy), tick, ns))
                        tick += 1
        if best_end is None:
            return None

        chain = []
        cur: tuple[int, int, int] | None = best_end
        while cur is not None:
            chain.append(cur)
            cur = parent[cur]
        chain.reverse()
        side, slot, p, a = origin[chain[0]]
        gside, _gslot, q, _, _ = goals[(best_end[0], best_end[1])]
        pts = [p, a] + [(self.xs[s[0]], self.ys[s[1]]) for s in chain]
        pts += [(self.xs[best_end[0]], self.ys[best_end[1]]), q]
        path = _simplify(pts)
        self.used_slots[(src.id, side)] += 1
        self.used_slots[(dst.id, gside)] += 1
        self._commit(path)
        return path

    def _commit(self, path: list[tuple[int, int]]) -> None:
        for v in path:
            self.blocked.add((self.xi[v[0]], self.yi[v[1]]))
        for (x1, y1), (x2, y2) in itertools.pairwise(path):
            if y1 == y2:
                iy = self.yi[y1]
                a, b = sorted((self.xi[x1], self.xi[x2]))
                self.occ_h.update((iy, i) for i in range(a, b))
                self.inter_h.update((i, iy) for i in range(a + 1, b))
            else:
                ix = self.xi[x1]
                a, b = sorted((self.yi[y1], self.yi[y2]))
                self.occ_v.update((ix, i) for i in range(a, b))
                self.inter_v.update((ix, i) for i in range(a + 1, b))


def _simplify(pts: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Bỏ điểm trùng và điểm nằm giữa hai đoạn thẳng hàng."""
    dedup = [pts[0]]
    for p in pts[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    out = [dedup[0]]
    for i in range(1, len(dedup) - 1):
        a, b, c = out[-1], dedup[i], dedup[i + 1]
        if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
            continue
        out.append(b)
    out.append(dedup[-1])
    return out
