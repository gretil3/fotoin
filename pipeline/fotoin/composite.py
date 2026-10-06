import cv2
import numpy as np
from PIL import Image

SHADOW_OPACITY = 0.30
SHADOW_OFFSET = 0.015  # fraction of canvas height, downward
SHADOW_BLUR = 0.02  # gaussian sigma as fraction of the short side


def make_background(size: tuple[int, int], kind: str = "white") -> np.ndarray:
    w, h = size
    if kind == "white":
        return np.full((h, w, 3), 255, np.float32)
    if kind == "gradient":
        # Soft radial falloff: pure white center, light gray corners.
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2)) / np.sqrt(2)
        return np.repeat((255 - 25 * d**1.5)[..., None], 3, axis=2)
    raise ValueError(f"unknown background: {kind}")


def composite(cut: Image.Image, size: tuple[int, int], background: str = "white", padding: float = 0.10, shadow: bool = True) -> Image.Image:
    """Center the RGBA cutout on the background, scaled to fill the padded frame."""
    cut = cut.crop(cut.getchannel("A").getbbox())
    w, h = size
    scale = min(w * (1 - 2 * padding) / cut.width, h * (1 - 2 * padding) / cut.height)
    cut = cut.resize((max(1, round(cut.width * scale)), max(1, round(cut.height * scale))), Image.Resampling.LANCZOS)
    x0, y0 = (w - cut.width) // 2, (h - cut.height) // 2

    rgb = np.zeros((h, w, 3), np.float32)
    a = np.zeros((h, w), np.float32)
    px = np.asarray(cut, np.float32)
    rgb[y0 : y0 + cut.height, x0 : x0 + cut.width] = px[..., :3]
    a[y0 : y0 + cut.height, x0 : x0 + cut.width] = px[..., 3] / 255

    bg = make_background(size, background)
    if shadow:
        shift = np.float32([[1, 0, 0], [0, 1, SHADOW_OFFSET * h]])
        sh = cv2.GaussianBlur(cv2.warpAffine(a, shift, (w, h)), (0, 0), SHADOW_BLUR * min(w, h))
        bg *= 1 - SHADOW_OPACITY * sh[..., None]
    out = bg * (1 - a[..., None]) + rgb * a[..., None]
    return Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), "RGB")
