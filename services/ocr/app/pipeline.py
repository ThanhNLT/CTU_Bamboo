# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Một trang ảnh → các dòng chữ: xoay hướng trang, phát hiện dòng (PaddleOCR), xoay dòng, nhận dạng (VietOCR).

Mọi mô hình chạy bằng PyTorch trên `device` (CUDA). Thứ tự đọc: trên xuống, trái sang phải; các ô cùng hàng
gộp thành một dòng. Không dựng lại bảng, bố cục.
"""

import os
from dataclasses import dataclass

import cv2
import numpy as np
import yaml
from PIL import Image

DET_MODEL = "PP-OCRv6_medium_det"
DOC_ORI_MODEL = "PP-LCNet_x1_0_doc_ori"
LINE_ORI_MODEL = "PP-LCNet_x1_0_textline_ori"
REC_MODEL = "vgg_transformer"
VIETOCR_FILES = {
    "base.yml": "config/base.yml",
    "vgg-transformer.yml": "config/vgg-transformer.yml",
    "vgg_transformer.pth": "vgg_transformer.pth",
}
REC_MAX_WIDTH = 1600
# VietOCR học trên đoạn ngắn: dòng dài hơn SEGMENT_RATIO lần chiều cao bị cắt cụt hoặc bịa phần đuôi,
# nên chia tại khoảng trắng giữa các từ rồi ghép lại.
SEGMENT_RATIO = 14
PAD_RATIO = 0.5
REC_BATCH = 32
DOC_ORI_MIN_SCORE = 0.6
# Nhãn của bộ xoay trang là góc cần xoay ngược chiều kim đồng hồ để trang đứng thẳng (như PaddleX rotate_image).
_ROTATE = {"90": cv2.ROTATE_90_COUNTERCLOCKWISE, "180": cv2.ROTATE_180, "270": cv2.ROTATE_90_CLOCKWISE}


@dataclass
class Models:
    doc_ori: object
    det: object
    line_ori: object
    rec: object


def paddle_models(device: str) -> dict:
    from paddleocr import DocImgOrientationClassification, TextDetection, TextLineOrientationClassification

    gpu = "gpu:" + device.split(":")[-1]
    return {
        "doc_ori": DocImgOrientationClassification(model_name=DOC_ORI_MODEL, engine="transformers", device=gpu),
        "det": TextDetection(model_name=DET_MODEL, engine="transformers", device=gpu),
        "line_ori": TextLineOrientationClassification(model_name=LINE_ORI_MODEL, engine="transformers", device=gpu),
    }


def vietocr_config(models_dir: str, device: str) -> dict:
    from vietocr.tool.config import Cfg

    folder = os.path.join(models_dir, "vietocr")
    config: dict = {}
    for name in ("base.yml", "vgg-transformer.yml"):
        with open(os.path.join(folder, name), encoding="utf-8") as f:
            config.update(yaml.safe_load(f))
    config["weights"] = os.path.join(folder, "vgg_transformer.pth")
    config["device"] = device
    config["cnn"]["pretrained"] = False
    config["predictor"]["beamsearch"] = False
    config["dataset"]["image_max_width"] = REC_MAX_WIDTH
    return Cfg(config)


def load(models_dir: str, device: str) -> Models:
    from vietocr.tool.predictor import Predictor

    paddle = paddle_models(device)
    return Models(rec=Predictor(vietocr_config(models_dir, device)), **paddle)


def _label(result) -> str:
    return str(result["label_names"][0])


def upright(models: Models, image: np.ndarray) -> np.ndarray:
    [res] = list(models.doc_ori.predict(image, batch_size=1))
    label = _label(res)
    if label in _ROTATE and float(res["scores"][0]) >= DOC_ORI_MIN_SCORE:
        return cv2.rotate(image, _ROTATE[label])
    return image


def crop(image: np.ndarray, poly: np.ndarray) -> np.ndarray:
    """Cắt một ô chữ (tứ giác) thành ảnh chữ nhật nằm ngang."""
    pts = poly.astype(np.float32)
    width = int(max(np.linalg.norm(pts[0] - pts[1]), np.linalg.norm(pts[2] - pts[3])))
    height = int(max(np.linalg.norm(pts[0] - pts[3]), np.linalg.norm(pts[1] - pts[2])))
    width, height = max(width, 1), max(height, 1)
    dst = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    out = cv2.warpPerspective(
        image, cv2.getPerspectiveTransform(pts, dst), (width, height), borderMode=cv2.BORDER_REPLICATE
    )
    if height >= 1.5 * width:
        out = np.rot90(out)
    return out


def segments(line: np.ndarray, ratio: float = SEGMENT_RATIO) -> list[np.ndarray]:
    """Chia ảnh một dòng dài thành các đoạn ngắn, cắt ở giữa khoảng trắng gần giới hạn nhất."""
    h, w = line.shape[:2]
    limit = int(ratio * h)
    if w <= limit:
        return [line]
    gray = cv2.cvtColor(line, cv2.COLOR_RGB2GRAY)
    _, ink = cv2.threshold(gray, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    blank = ink.sum(axis=0) == 0
    pieces, start = [], 0
    while w - start > limit:
        lo, hi = start + limit // 2, start + limit
        gaps = np.flatnonzero(blank[lo:hi])
        if len(gaps):
            run_end = gaps[-1]
            run_start = run_end
            while run_start - 1 >= 0 and blank[lo + run_start - 1]:
                run_start -= 1
            cut = lo + (run_start + run_end) // 2
        else:
            cut = hi
        pieces.append(line[:, start:cut])
        start = cut
    pieces.append(line[:, start:])
    return [p for p in pieces if p.shape[1] > 2]


def padded(piece: np.ndarray, ratio: float = PAD_RATIO) -> Image.Image:
    """Thêm lề hai bên: VietOCR đọc sai hoặc bịa từ cuối khi chữ sát mép ảnh."""
    pad = max(int(piece.shape[0] * ratio), 1)
    return Image.fromarray(cv2.copyMakeBorder(piece, 0, 0, pad, pad, cv2.BORDER_REPLICATE))


def reading_order(boxes: list[dict]) -> list[list[dict]]:
    """Gom ô thành hàng (tâm dọc nằm trong nửa chiều cao của hàng), hàng trên xuống, ô trái sang phải."""
    rows: list[list[dict]] = []
    for box in sorted(boxes, key=lambda b: (b["cy"], b["x"])):
        row = rows[-1] if rows else None
        if row and abs(box["cy"] - np.mean([b["cy"] for b in row])) <= 0.5 * np.mean([b["h"] for b in row]):
            row.append(box)
        else:
            rows.append([box])
    return [sorted(r, key=lambda b: b["x"]) for r in rows]


def recognize(models: Models, image: np.ndarray) -> list[dict]:
    image = upright(models, image)
    [det] = list(models.det.predict(image, batch_size=1))
    polys = [np.asarray(p) for p in det["dt_polys"]]
    if not polys:
        return []
    crops = [crop(image, p) for p in polys]
    for i, res in enumerate(models.line_ori.predict(crops, batch_size=REC_BATCH)):
        if _label(res) == "180":
            crops[i] = cv2.rotate(crops[i], cv2.ROTATE_180)
    parts = [(i, p) for i, c in enumerate(crops) for p in segments(c)]
    read: list[str] = []
    for k in range(0, len(parts), REC_BATCH):
        read += models.rec.predict_batch([padded(p) for _, p in parts[k : k + REC_BATCH]])
    texts = [""] * len(crops)
    for (i, _), t in zip(parts, read, strict=True):
        texts[i] = f"{texts[i]} {t.strip()}".strip()
    boxes = []
    for poly, text in zip(polys, texts, strict=True):
        xs, ys = poly[:, 0], poly[:, 1]
        boxes.append(
            {
                "text": text.strip(),
                "x": float(xs.min()),
                "cy": float(ys.mean()),
                "h": float(ys.max() - ys.min()),
                "box": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
            }
        )
    lines = []
    for row in reading_order([b for b in boxes if b["text"]]):
        lines.append(
            {
                "text": " ".join(b["text"] for b in row),
                "box": [
                    min(b["box"][0] for b in row),
                    min(b["box"][1] for b in row),
                    max(b["box"][2] for b in row),
                    max(b["box"][3] for b in row),
                ],
            }
        )
    return lines
