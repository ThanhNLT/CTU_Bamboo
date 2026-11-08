import threading

from bamboo_common.openbao import Bao, BaoError


class PiiCipher:
    def __init__(self, addr: str, approle_file: str):
        self.addr = addr
        self.approle_file = approle_file
        self._bao: Bao | None = None
        self._lock = threading.Lock()

    def _client(self, fresh: bool = False) -> Bao:
        with self._lock:
            if self._bao is None or fresh:
                self._bao = Bao.from_approle_file(self.addr, self.approle_file)
            return self._bao

    def _call(self, method: str, value: str) -> str:
        try:
            return getattr(self._client(), method)(value)
        except BaoError as exc:
            if exc.status != 403:
                raise
            return getattr(self._client(fresh=True), method)(value)

    def encrypt(self, plaintext: str) -> str:
        return self._call("encrypt", plaintext)

    def decrypt(self, ciphertext: str) -> str:
        return self._call("decrypt", ciphertext)


def mask_tail(value: str, keep: int) -> str:
    compact = "".join(value.split())
    if len(compact) <= keep:
        return "•" * len(compact)
    return "•" * (len(compact) - keep) + compact[-keep:]


def mask_address(value: str) -> str:
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return f"•••, {parts[-1]}" if len(parts) > 1 else "•••"
