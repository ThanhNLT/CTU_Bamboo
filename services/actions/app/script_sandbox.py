# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Kịch bản do người dùng viết trong quy trình tự động (ADR #73).

Ngôn ngữ là một tập con của Python, chạy bằng trình thông dịch duyệt cây cú pháp ở đây, không bao giờ dùng exec/eval:
- được dùng: gán (cả `a[i] = x`, `a, b = ...`, `+=`), if/elif/else, for/while (có break/continue), biểu thức số học,
  so sánh, and/or/not, biểu thức điều kiện, list/dict/tuple, list/dict comprehension, f-string, cắt chuỗi/mảng;
- hàm có sẵn: BUILTINS; phương thức chỉ của str/list/dict trong METHODS;
- không có: import, def/lambda/class, thuộc tính (trừ gọi phương thức được phép), tên bắt đầu bằng `_`, try/with,
  global, yield, await, truy cập tệp, mạng hay hệ thống.
Mỗi lần chạy giới hạn số bước, thời gian, độ dài chuỗi, số phần tử và độ lớn số, nên vòng lặp vô hạn hay phép tính
khổng lồ dừng với lỗi rõ ràng thay vì làm treo dịch vụ.

Biến của quy trình là tên có sẵn khi chạy; mọi tên kiểu đơn (chuỗi, số, đúng/sai, None) được gán mới hoặc đổi giá trị ở
cấp ngoài cùng trở thành biến quy trình sau bước này. `log(...)` ghi một dòng nhật ký của lần chạy.
"""

import ast
import datetime as dt
import math
import re
import time
from dataclasses import dataclass, field

MAX_SOURCE = 8000
MAX_STEPS = 200_000
MAX_SECONDS = 2.0
MAX_STR = 20_000
MAX_ITEMS = 5_000
MAX_INT_BITS = 256
MAX_LOG_LINES = 50
MAX_OUTPUTS = 50
RESERVED = {"initiator", "sandbox", "event"}
SCALAR = (str, int, float, bool, type(None))
FORMAT_SPEC = re.compile(r"^(.?[<>^=])?[+\- ]?0?\d{0,3}[,_]?(\.\d{1,2})?[bcdeEfFgGnosxX%]?$")


class ScriptError(Exception):
    def __init__(self, message: str, line: int | None = None):
        super().__init__(f"Dòng {line}: {message}" if line else message)
        self.line = line


class _Break(Exception):
    pass


class _Continue(Exception):
    pass


@dataclass
class Result:
    outputs: dict
    log: list[str] = field(default_factory=list)
    steps: int = 0


def _days_between(a: str, b: str) -> int:
    return (dt.date.fromisoformat(str(b)[:10]) - dt.date.fromisoformat(str(a)[:10])).days


def _add_days(day: str, n: int) -> str:
    return (dt.date.fromisoformat(str(day)[:10]) + dt.timedelta(days=int(n))).isoformat()


def _today() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date().isoformat()


def _now() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(timespec="seconds")


def _round(x, n=0):
    return round(x, int(n)) if n else round(x)


BUILTINS = {
    "len": len,
    "min": min,
    "max": max,
    "sum": sum,
    "abs": abs,
    "round": _round,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "sorted": sorted,
    "list": list,
    "dict": dict,
    "any": any,
    "all": all,
    "enumerate": enumerate,
    "zip": zip,
    "reversed": reversed,
    "range": range,
    "floor": math.floor,
    "ceil": math.ceil,
    "today": _today,
    "now": _now,
    "days_between": _days_between,
    "add_days": _add_days,
}
CALL_KEYWORDS = {"sorted": {"reverse"}, "round": set(), "split": {"maxsplit"}, "sort": {"reverse"}}
METHODS = {
    str: {"lower", "upper", "strip", "lstrip", "rstrip", "split", "replace", "startswith", "endswith", "find",
          "join", "title", "capitalize", "count", "isdigit", "zfill"},
    list: {"append", "pop", "index", "count", "extend", "insert", "remove", "sort", "reverse", "copy"},
    dict: {"get", "keys", "values", "items", "pop", "update", "copy", "setdefault"},
}  # fmt: skip
BINOPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
    ast.Pow: lambda a, b: a**b,
}
CMPOPS = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
    ast.Is: lambda a, b: a is b,
    ast.IsNot: lambda a, b: a is not b,
}
VALUE_TYPES = (str, int, float, bool, type(None), list, dict, tuple, range, enumerate, zip, reversed)


def _size_ok(value) -> None:
    if isinstance(value, str) and len(value) > MAX_STR:
        raise ScriptError(f"Chuỗi dài quá {MAX_STR} ký tự")
    if isinstance(value, (list, dict, tuple)) and len(value) > MAX_ITEMS:
        raise ScriptError(f"Danh sách quá {MAX_ITEMS} phần tử")
    if isinstance(value, int) and not isinstance(value, bool) and value.bit_length() > MAX_INT_BITS:
        raise ScriptError("Số quá lớn")
    if isinstance(value, float) and (math.isinf(value) or math.isnan(value)):
        raise ScriptError("Kết quả không phải số hữu hạn")


class Interpreter:
    def __init__(self, variables: dict, max_steps: int = MAX_STEPS, max_seconds: float = MAX_SECONDS):
        self.env: dict = dict(variables)
        self.log: list[str] = []
        self.steps = 0
        self.max_steps = max_steps
        self.deadline = time.monotonic() + max_seconds
        self.builtins = {**BUILTINS, "log": self._log}

    def _tick(self, node: ast.AST) -> None:
        self.steps += 1
        if self.steps > self.max_steps:
            raise ScriptError(f"Vượt {self.max_steps} bước tính (vòng lặp quá dài?)", getattr(node, "lineno", None))
        if self.steps % 1000 == 0 and time.monotonic() > self.deadline:
            raise ScriptError("Chạy quá thời gian cho phép", getattr(node, "lineno", None))

    def _log(self, *parts) -> None:
        if len(self.log) < MAX_LOG_LINES:
            self.log.append(" ".join(str(p) for p in parts)[:500])

    @staticmethod
    def _name_ok(name: str, node: ast.AST) -> None:
        if name.startswith("_"):
            raise ScriptError("Không dùng tên bắt đầu bằng dấu gạch dưới", getattr(node, "lineno", None))

    def run(self, tree: ast.Module) -> None:
        self._block(tree.body)

    def _block(self, body: list[ast.stmt]) -> None:
        for stmt in body:
            self._stmt(stmt)

    def _stmt(self, node: ast.stmt) -> None:
        try:
            self._exec(node)
        except ScriptError as exc:
            if exc.line is None:
                raise ScriptError(str(exc), node.lineno) from None
            raise

    def _exec(self, node: ast.stmt) -> None:
        self._tick(node)
        match node:
            case ast.Expr(value=value):
                self._expr(value)
            case ast.Assign(targets=targets, value=value):
                result = self._expr(value)
                for target in targets:
                    self._assign(target, result)
            case ast.AugAssign(target=target, op=op, value=value):
                current = self._expr(self._load_of(target))
                self._assign(target, self._binop(op, current, self._expr(value), node))
            case ast.AnnAssign(target=target, value=value) if value is not None:
                self._assign(target, self._expr(value))
            case ast.If(test=test, body=body, orelse=orelse):
                self._block(body if self._truth(self._expr(test)) else orelse)
            case ast.For(target=target, iter=it, body=body, orelse=orelse):
                broke = False
                for item in self._iter(self._expr(it), node):
                    self._tick(node)
                    self._assign(target, item)
                    try:
                        self._block(body)
                    except _Break:
                        broke = True
                        break
                    except _Continue:
                        continue
                if not broke:
                    self._block(orelse)
            case ast.While(test=test, body=body, orelse=orelse):
                broke = False
                while self._truth(self._expr(test)):
                    self._tick(node)
                    try:
                        self._block(body)
                    except _Break:
                        broke = True
                        break
                    except _Continue:
                        continue
                if not broke:
                    self._block(orelse)
            case ast.Break():
                raise _Break
            case ast.Continue():
                raise _Continue
            case ast.Pass():
                pass
            case _:
                raise ScriptError(f"Không hỗ trợ câu lệnh {type(node).__name__}", node.lineno)

    @staticmethod
    def _load_of(target: ast.expr) -> ast.expr:
        if isinstance(target, ast.Name):
            return ast.Name(id=target.id, ctx=ast.Load(), lineno=target.lineno)
        if isinstance(target, ast.Subscript):
            return ast.Subscript(value=target.value, slice=target.slice, ctx=ast.Load(), lineno=target.lineno)
        raise ScriptError("Phép gán kết hợp chỉ dùng cho tên biến hoặc phần tử", getattr(target, "lineno", None))

    def _assign(self, target: ast.expr, value) -> None:
        match target:
            case ast.Name(id=name):
                self._name_ok(name, target)
                if name in self.builtins:
                    raise ScriptError(f"Không đặt lại hàm có sẵn {name}", target.lineno)
                _size_ok(value)
                self.env[name] = value
            case ast.Tuple(elts=elts) | ast.List(elts=elts):
                values = list(self._iter(value, target))
                if len(values) != len(elts):
                    raise ScriptError("Số giá trị không khớp số biến khi gán", target.lineno)
                for elt, v in zip(elts, values, strict=True):
                    self._assign(elt, v)
            case ast.Subscript(value=container, slice=index):
                obj = self._expr(container)
                if not isinstance(obj, (list, dict)):
                    raise ScriptError("Chỉ gán phần tử cho list hoặc dict", target.lineno)
                key = self._expr(index)
                self._guard(lambda: obj.__setitem__(key, value), target)
                _size_ok(obj)
            case _:
                raise ScriptError("Vế trái phép gán không hợp lệ", getattr(target, "lineno", None))

    def _truth(self, value) -> bool:
        return bool(value)

    def _iter(self, value, node):
        if not isinstance(value, (list, tuple, dict, str, range, enumerate, zip, reversed)):
            raise ScriptError("Chỉ lặp được trên chuỗi, list, dict, range", getattr(node, "lineno", None))
        if isinstance(value, range) and len(value) > MAX_ITEMS * 10:
            raise ScriptError("range quá lớn", getattr(node, "lineno", None))
        return iter(value)

    def _guard(self, fn, node):
        try:
            return fn()
        except ScriptError:
            raise
        except (_Break, _Continue):
            raise
        except ZeroDivisionError as exc:
            raise ScriptError("Chia cho 0", getattr(node, "lineno", None)) from exc
        except (KeyError, IndexError) as exc:
            raise ScriptError(f"Không có phần tử {exc}", getattr(node, "lineno", None)) from exc
        except (TypeError, ValueError, AttributeError, OverflowError) as exc:
            raise ScriptError(str(exc).split("\n")[0][:200], getattr(node, "lineno", None)) from exc

    def _binop(self, op: ast.operator, a, b, node):
        fn = BINOPS.get(type(op))
        if fn is None:
            raise ScriptError(f"Không hỗ trợ phép toán {type(op).__name__}", node.lineno)
        if isinstance(op, ast.Pow) and (not isinstance(b, (int, float)) or abs(b) > 64):
            raise ScriptError("Số mũ tối đa 64", node.lineno)
        if isinstance(op, ast.Mult):
            seq, n = (a, b) if isinstance(a, (str, list, tuple)) else (b, a)
            if isinstance(seq, (str, list, tuple)) and isinstance(n, int) and len(seq) * max(n, 0) > MAX_STR:
                raise ScriptError("Kết quả nhân chuỗi/danh sách quá lớn", node.lineno)
        result = self._guard(lambda: fn(a, b), node)
        _size_ok(result)
        return result

    def _expr(self, node: ast.expr):
        self._tick(node)
        match node:
            case ast.Constant(value=value):
                if not isinstance(value, SCALAR):
                    raise ScriptError("Hằng số không hỗ trợ", node.lineno)
                return value
            case ast.Name(id=name):
                self._name_ok(name, node)
                if name in self.env:
                    return self.env[name]
                if name in self.builtins:
                    return self.builtins[name]
                if name in ("True", "False", "None"):
                    return {"True": True, "False": False, "None": None}[name]
                raise ScriptError(f"Chưa có biến {name}", node.lineno)
            case ast.BinOp(left=left, op=op, right=right):
                return self._binop(op, self._expr(left), self._expr(right), node)
            case ast.UnaryOp(op=op, operand=operand):
                value = self._expr(operand)
                if isinstance(op, ast.Not):
                    return not value
                if isinstance(op, ast.USub):
                    return self._guard(lambda: -value, node)
                if isinstance(op, ast.UAdd):
                    return self._guard(lambda: +value, node)
                raise ScriptError("Phép toán một ngôi không hỗ trợ", node.lineno)
            case ast.BoolOp(op=op, values=values):
                result = None
                for v in values:
                    result = self._expr(v)
                    if isinstance(op, ast.And) and not result:
                        return result
                    if isinstance(op, ast.Or) and result:
                        return result
                return result
            case ast.Compare(left=left, ops=ops, comparators=comparators):
                a = self._expr(left)
                for op, comp in zip(ops, comparators, strict=True):
                    b = self._expr(comp)
                    if isinstance(op, (ast.Is, ast.IsNot)) and b is not None and a is not None:
                        raise ScriptError("Chỉ dùng is / is not để so với None", node.lineno)
                    if not self._guard(lambda a=a, b=b, op=op: CMPOPS[type(op)](a, b), node):
                        return False
                    a = b
                return True
            case ast.IfExp(test=test, body=body, orelse=orelse):
                return self._expr(body) if self._truth(self._expr(test)) else self._expr(orelse)
            case ast.List(elts=elts):
                return self._sized([self._expr(e) for e in elts])
            case ast.Tuple(elts=elts):
                return tuple(self._expr(e) for e in elts)
            case ast.Dict(keys=keys, values=values):
                if any(k is None for k in keys):
                    raise ScriptError("Không hỗ trợ **dict", node.lineno)
                return self._sized({self._expr(k): self._expr(v) for k, v in zip(keys, values, strict=True)})
            case ast.JoinedStr(values=values):
                return self._sized("".join(str(self._expr(v)) for v in values))
            case ast.FormattedValue(value=value, format_spec=spec):
                if spec is not None:
                    fmt = self._expr(spec)
                    if not FORMAT_SPEC.match(fmt):
                        raise ScriptError("Định dạng f-string không hợp lệ", node.lineno)
                    return self._guard(lambda: format(self._expr(value), fmt), node)
                return self._expr(value)
            case ast.Subscript(value=container, slice=index):
                obj = self._expr(container)
                if not isinstance(obj, (str, list, tuple, dict)):
                    raise ScriptError("Chỉ lấy phần tử của chuỗi, list, tuple, dict", node.lineno)
                key = self._slice(index) if isinstance(index, ast.Slice) else self._expr(index)
                return self._guard(lambda: obj[key], node)
            case ast.Call():
                return self._call(node)
            case ast.ListComp(elt=elt, generators=gens):
                out: list = []
                self._comprehension(gens, 0, lambda: out.append(self._expr(elt)), node)
                return self._sized(out)
            case ast.DictComp(key=key, value=value, generators=gens):
                out_d: dict = {}
                self._comprehension(gens, 0, lambda: out_d.__setitem__(self._expr(key), self._expr(value)), node)
                return self._sized(out_d)
            case _:
                raise ScriptError(f"Không hỗ trợ biểu thức {type(node).__name__}", getattr(node, "lineno", None))

    @staticmethod
    def _sized(value):
        _size_ok(value)
        return value

    def _slice(self, node: ast.Slice) -> slice:
        part = lambda n: None if n is None else self._expr(n)  # noqa: E731
        return slice(part(node.lower), part(node.upper), part(node.step))

    def _comprehension(self, gens: list[ast.comprehension], i: int, emit, node) -> None:
        if i == len(gens):
            emit()
            return
        gen = gens[i]
        if gen.is_async:
            raise ScriptError("Không hỗ trợ async", node.lineno)
        for item in self._iter(self._expr(gen.iter), node):
            self._tick(node)
            self._assign(gen.target, item)
            if all(self._truth(self._expr(cond)) for cond in gen.ifs):
                self._comprehension(gens, i + 1, emit, node)

    def _call(self, node: ast.Call):
        if any(isinstance(a, ast.Starred) for a in node.args) or any(k.arg is None for k in node.keywords):
            raise ScriptError("Không hỗ trợ *args, **kwargs", node.lineno)
        args = [self._expr(a) for a in node.args]
        kwargs = {k.arg: self._expr(k.value) for k in node.keywords}
        func = node.func
        if isinstance(func, ast.Name):
            self._name_ok(func.id, func)
            fn = self.builtins.get(func.id)
            if fn is None:
                raise ScriptError(f"Không có hàm {func.id}", node.lineno)
            name = func.id
            if name in ("sorted", "min", "max") and "key" in kwargs:
                raise ScriptError("Không hỗ trợ key=", node.lineno)
        elif isinstance(func, ast.Attribute):
            self._name_ok(func.attr, func)
            obj = self._expr(func.value)
            allowed = next((names for kind, names in METHODS.items() if type(obj) is kind), None)
            if allowed is None or func.attr not in allowed:
                raise ScriptError(f"Không dùng được phương thức {func.attr}", node.lineno)
            fn, name = getattr(obj, func.attr), func.attr
        else:
            raise ScriptError("Chỉ gọi hàm có sẵn hoặc phương thức được phép", node.lineno)
        extra = set(kwargs) - CALL_KEYWORDS.get(name, set())
        if extra:
            raise ScriptError(f"Tham số không hỗ trợ: {', '.join(sorted(extra))}", node.lineno)
        if name == "range" and any(isinstance(a, int) and abs(a) > MAX_ITEMS * 10 for a in args):
            raise ScriptError("range quá lớn", node.lineno)
        if name == "zfill" and args and isinstance(args[0], int) and args[0] > MAX_STR:
            raise ScriptError("Chuỗi quá dài", node.lineno)
        if name == "join" and args and isinstance(args[0], (list, tuple)):
            total = sum(len(x) for x in args[0] if isinstance(x, str)) + len(obj) * len(args[0])
            if total > MAX_STR:
                raise ScriptError(f"Chuỗi dài quá {MAX_STR} ký tự", node.lineno)
        if name == "replace" and len(args) >= 2 and all(isinstance(a, str) for a in args[:2]):
            old, new = args[0], args[1]
            hits = obj.count(old) if old else len(obj) + 1
            if len(obj) + hits * len(new) > MAX_STR:
                raise ScriptError(f"Chuỗi dài quá {MAX_STR} ký tự", node.lineno)
        if name in ("str", "int") and args and isinstance(args[0], int) and args[0].bit_length() > MAX_INT_BITS:
            raise ScriptError("Số quá lớn", node.lineno)
        result = self._guard(lambda: fn(*args, **kwargs), node)
        if not isinstance(result, VALUE_TYPES) and not callable(result) and type(result).__name__ not in (
            "dict_keys", "dict_values", "dict_items", "list_reverseiterator", "str_ascii_iterator"
        ):  # fmt: skip
            raise ScriptError("Kết quả không hỗ trợ", node.lineno)
        if type(result).__name__ in ("dict_keys", "dict_values", "dict_items"):
            result = list(result)
        _size_ok(result)
        return result


def parse(source: str) -> ast.Module:
    if len(source) > MAX_SOURCE:
        raise ScriptError(f"Kịch bản tối đa {MAX_SOURCE} ký tự")
    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as exc:
        raise ScriptError(f"Sai cú pháp: {exc.msg}", exc.lineno) from exc
    except (RecursionError, MemoryError, ValueError) as exc:
        raise ScriptError("Kịch bản lồng quá sâu hoặc không đọc được") from exc
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
                             ast.Lambda, ast.Global, ast.Nonlocal, ast.Try, ast.With, ast.Yield, ast.YieldFrom,
                             ast.Await, ast.Delete, ast.Raise, ast.Assert, ast.Return, ast.NamedExpr,
                             ast.GeneratorExp, ast.SetComp, ast.Set, ast.Starred, ast.Match)):  # fmt: skip
            raise ScriptError(f"Không hỗ trợ {type(node).__name__}", getattr(node, "lineno", None))
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise ScriptError("Không dùng thuộc tính bắt đầu bằng dấu gạch dưới", node.lineno)
        if isinstance(node, ast.Name) and node.id.startswith("_"):
            raise ScriptError("Không dùng tên bắt đầu bằng dấu gạch dưới", node.lineno)
    return tree


def run(source: str, variables: dict | None = None, *, max_steps: int = MAX_STEPS) -> Result:
    """Chạy kịch bản; trả biến kiểu đơn được gán mới hoặc đổi giá trị (thành biến quy trình) và nhật ký."""
    tree = parse(source)
    inputs = {k: v for k, v in (variables or {}).items() if isinstance(k, str) and not k.startswith("_")}
    interp = Interpreter(inputs, max_steps=max_steps)
    try:
        interp.run(tree)
    except (_Break, _Continue) as exc:
        raise ScriptError("break/continue nằm ngoài vòng lặp") from exc
    except RecursionError as exc:
        raise ScriptError("Biểu thức lồng quá sâu") from exc
    outputs = {}
    for name, value in interp.env.items():
        if name in RESERVED or callable(value):
            continue
        if name in inputs and inputs[name] == value and type(inputs[name]) is type(value):
            continue
        if isinstance(value, SCALAR):
            outputs[name] = value
    if len(outputs) > MAX_OUTPUTS:
        raise ScriptError(f"Kịch bản đặt quá {MAX_OUTPUTS} biến")
    return Result(outputs, interp.log, interp.steps)
