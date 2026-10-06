import os
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np
from PIL import Image


class Segmenter(Protocol):
    """Anything that maps an RGB image to a uint8 HxW alpha mask (255 = product)."""

    def __call__(self, img: Image.Image) -> np.ndarray: ...


class RembgSegmenter:
    """rembg backend. Swap models via name: u2net, u2netp, silueta, birefnet-general-lite."""

    def __init__(self, model: str = "u2net", model_dir: str | Path = "models", allow_download: bool = False):
        os.environ["U2NET_HOME"] = str(model_dir)
        if not allow_download and not any(Path(model_dir).rglob(f"{model}*.onnx")):
            raise FileNotFoundError(
                f"Model '{model}' not found in {model_dir}. Run `fotoin --download-models` once."
            )
        from rembg import new_session  # heavy import, only when actually segmenting

        self.session = new_session(model)

    def __call__(self, img: Image.Image) -> np.ndarray:
        from rembg import remove

        return np.asarray(remove(img, session=self.session, only_mask=True).convert("L"))


def clean_alpha(alpha: np.ndarray, min_blob_frac: float = 0.02, choke_px: int = 1, feather_px: float = 1.0) -> np.ndarray:
    """Drop small islands, choke the edge (kills background halo), then feather slightly."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 127).astype(np.uint8), connectivity=8)
    if n <= 1:
        return np.zeros_like(alpha)
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = np.isin(labels, np.flatnonzero(areas >= areas.max() * min_blob_frac) + 1).astype(np.uint8)
    # Grow the kept region a little so its own soft edge survives; everything else goes.
    keep = cv2.dilate(keep, np.ones((5, 5), np.uint8))
    out = alpha * keep
    if choke_px > 0:
        out = cv2.erode(out, np.ones((2 * choke_px + 1,) * 2, np.uint8))
    if feather_px > 0:
        out = cv2.GaussianBlur(out, (0, 0), feather_px)
    out[out < 8] = 0  # no near-invisible stray pixels
    return out


def cutout(img: Image.Image, alpha: np.ndarray) -> Image.Image:
    rgba = img.convert("RGBA")
    rgba.putalpha(Image.fromarray(alpha, "L"))
    return rgba
