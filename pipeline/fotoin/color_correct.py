import cv2
import numpy as np
from skimage.exposure import match_histograms

from fotoin.config import ColorCfg


def gray_world(rgb: np.ndarray, mask: np.ndarray, max_shift: float = 0.12) -> np.ndarray:
    """Gray-world white balance over the product's near-neutral pixels only (labels, caps, text).
    Plain gray-world over all product pixels treats a green bottle as a green cast and turns its
    white label pink. Too few neutral pixels -> no correction at all."""
    px = rgb[mask].astype(np.float32)
    hi, lo = px.max(axis=1), px.min(axis=1)
    neutral = px[((hi - lo) / np.maximum(hi, 1) < 0.25) & (hi > 40) & (hi < 250)]
    if len(neutral) < max(0.01 * len(px), 50):
        return rgb
    means = neutral.mean(axis=0)
    gains = np.clip(means.mean() / np.maximum(means, 1e-3), 1 - max_shift, 1 + max_shift)
    return np.clip(rgb * gains, 0, 255).astype(np.uint8)


def clahe(rgb: np.ndarray, clip: float = 1.5) -> np.ndarray:
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    lab[..., 0] = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(lab[..., 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def normalize_exposure(rgb: np.ndarray, mask: np.ndarray, target: float = 0.5) -> np.ndarray:
    """Gamma so the product's mean luminance moves toward target. Clamped to stay mild,
    so a black product stays black and a white one stays white."""
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)[mask]
    if len(lum) == 0:
        return rgb
    mean = float(np.clip(lum.mean() / 255, 0.01, 0.99))
    gamma = float(np.clip(np.log(target) / np.log(mean), 0.75, 1.33))
    lut = (255 * (np.arange(256) / 255) ** gamma).astype(np.uint8)
    return cv2.LUT(rgb, lut)


def white_point(rgb: np.ndarray, mask: np.ndarray, target: float = 250, pct: float = 98, max_gain: float = 1.3) -> np.ndarray:
    """Scale all channels equally so the product's bright end (pct-th luminance percentile) lands
    near target. Only ever brightens, so hue is kept and a dim cafe photo stops looking dingy
    against the pure-white studio background."""
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)[mask]
    if len(lum) == 0:
        return rgb
    gain = float(np.clip(target / max(np.percentile(lum, pct), 1.0), 1.0, max_gain))
    return np.clip(rgb.astype(np.float32) * gain, 0, 255).round().astype(np.uint8)


def match_reference(rgb: np.ndarray, mask: np.ndarray, reference: np.ndarray) -> np.ndarray:
    out = rgb.copy()
    matched = match_histograms(rgb[mask][None], reference.reshape(1, -1, 3), channel_axis=-1)[0]
    out[mask] = np.clip(np.rint(matched), 0, 255).astype(np.uint8)
    return out


def correct(rgb: np.ndarray, alpha: np.ndarray, cfg: ColorCfg, reference: np.ndarray | None = None) -> np.ndarray:
    """Apply the enabled steps. Background pixels may change too; they get discarded at composite."""
    mask = alpha > 127
    if cfg.white_balance:
        rgb = gray_world(rgb, mask, cfg.wb_max_shift)
    if cfg.exposure:
        rgb = normalize_exposure(rgb, mask, cfg.exposure_target)
    if cfg.clahe:
        rgb = clahe(rgb, cfg.clahe_clip)
    if cfg.white_point:
        rgb = white_point(rgb, mask, cfg.white_target)
    if reference is not None:
        rgb = match_reference(rgb, mask, reference)
    return rgb
