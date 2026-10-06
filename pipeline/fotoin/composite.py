import cv2
import numpy as np
from PIL import Image

# Shadow/reflection look. Tune by eye on real samples; sizes are relative to the product's base width.
CONTACT_OPACITY = 0.55  # tight dark line where the product touches the floor
AMBIENT_OPACITY = 0.22  # wide soft pool around the base
REFLECTION_OPACITY = 0.22  # at the base, fading to 0
REFLECTION_LENGTH = 0.35  # fraction of product height
# Flat-lay (shot straight down): soft shadow all around, light from slightly above-front.
FLATLAY_OPACITY = 0.28
FLATLAY_OFFSET = 0.012  # fraction of canvas height, downward
FLATLAY_BLUR = 0.012  # gaussian sigma as fraction of the short side

SHARPEN_SIGMA = 0.002  # unsharp-mask radius as fraction of the short side (2px at 1000px)

STYLES = ("standing", "flatlay")


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


def contact_shadow(a: np.ndarray) -> np.ndarray:
    """Darkness map (0..1) for a product standing on a floor: a tight contact ellipse under the
    base plus a wide soft ambient pool. The base is the bottom 4% of the product's silhouette."""
    ys = np.flatnonzero(a.max(axis=1) > 0.5)
    if len(ys) == 0:
        return np.zeros_like(a)
    top, bottom = ys[0], ys[-1]
    band = a[bottom - max(1, round(0.04 * (bottom - top))) : bottom + 1] > 0.5
    cols = np.flatnonzero(band.any(axis=0))
    cx, half = (cols[0] + cols[-1]) / 2, max(2.0, (cols[-1] - cols[0] + 1) / 2)
    # Vertical extent scales with the base, capped so the pool fades out before the canvas edge.
    s = min(half, (a.shape[0] - bottom) / 0.45)

    def blob(rx: float, ry: float, blur: float) -> np.ndarray:
        m = np.zeros_like(a)
        cv2.ellipse(m, (round(cx), int(bottom)), (round(rx), max(1, round(ry))), 0, 0, 360, 1.0, -1)
        return cv2.GaussianBlur(m, (0, 0), max(1.0, blur))

    contact = blob(half * 1.02, s * 0.05, s * 0.04)
    ambient = blob(half * 1.5, s * 0.12, s * 0.12)
    return np.clip(CONTACT_OPACITY * contact + AMBIENT_OPACITY * ambient, 0, 0.9)


def flatlay_shadow(a: np.ndarray) -> np.ndarray:
    """Darkness map for a product lying flat: the whole silhouette, nudged down and blurred."""
    h, w = a.shape
    shift = np.float32([[1, 0, 0], [0, 1, FLATLAY_OFFSET * h]])
    return FLATLAY_OPACITY * cv2.GaussianBlur(cv2.warpAffine(a, shift, (w, h)), (0, 0), FLATLAY_BLUR * min(w, h))


def add_reflection(bg: np.ndarray, rgb: np.ndarray, a: np.ndarray) -> None:
    """Blend a fading upside-down copy of the product below its base into bg, in place."""
    ys = np.flatnonzero(a.max(axis=1) > 0.5)
    if len(ys) == 0:
        return
    top, bottom = ys[0], ys[-1]
    n = min(round(REFLECTION_LENGTH * (bottom - top + 1)), a.shape[0] - bottom - 1)
    if n <= 0:
        return
    src, dst = bottom - np.arange(n), bottom + 1 + np.arange(n)
    ra = a[src] * (REFLECTION_OPACITY * (1 - np.arange(n) / n) ** 1.5)[:, None]
    bg[dst] = bg[dst] * (1 - ra[..., None]) + rgb[src] * ra[..., None]


def composite(
    cut: Image.Image,
    size: tuple[int, int],
    background: str = "white",
    padding: float = 0.10,
    shadow: bool = True,
    reflection: bool = False,
    style: str = "standing",
    sharpen: float = 0.0,
) -> Image.Image:
    """Center the RGBA cutout on the background, scaled to fill the padded frame.
    style: "standing" (shot at product height, floor shadow) or "flatlay" (shot from above)."""
    if style not in STYLES:
        raise ValueError(f"unknown style: {style}")
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
        bg *= 1 - (contact_shadow(a) if style == "standing" else flatlay_shadow(a))[..., None]
    if reflection and style == "standing":  # a flat-lay has no floor plane to reflect in
        add_reflection(bg, rgb, a)
    out = bg * (1 - a[..., None]) + rgb * a[..., None]
    if sharpen > 0:  # unsharp mask on the product only; upscaled phone photos are soft
        detail = out - cv2.GaussianBlur(out, (0, 0), SHARPEN_SIGMA * min(w, h))
        out += sharpen * detail * a[..., None]
    return Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), "RGB")
