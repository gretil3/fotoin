from functools import lru_cache
from pathlib import Path
from typing import BinaryIO

import numpy as np
from PIL import Image

from fotoin.color_correct import correct, light_tint
from fotoin.composite import composite
from fotoin.config import Config, Preset
from fotoin.load import load_image
from fotoin.segment import RembgSegmenter, Segmenter, clean_alpha, cutout, decontaminate


class NoProductError(ValueError):
    pass


@lru_cache
def get_segmenter(model: str, model_dir: str) -> Segmenter:
    return RembgSegmenter(model, model_dir)


def extract(
    src: str | Path | bytes | BinaryIO, cfg: Config, segmenter: Segmenter | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """Segment and color-correct: (rgb HxWx3, alpha HxW). Everything before compositing."""
    img = load_image(src, cfg.max_side)
    seg, s = segmenter or get_segmenter(cfg.segment.model, cfg.segment.model_dir), cfg.segment
    alpha = clean_alpha(seg(img), s.min_blob_frac, s.choke_px, s.feather_px)
    if alpha.max() == 0:
        raise NoProductError("no product found in image")
    ref = np.asarray(load_image(cfg.color.reference)) if cfg.color.reference else None
    return decontaminate(correct(np.asarray(img), alpha, cfg.color, ref), alpha, s.decontaminate_px), alpha


def product_cutout(src: str | Path | bytes | BinaryIO, cfg: Config, segmenter: Segmenter | None = None) -> Image.Image:
    """The corrected product alone, RGBA, cropped to its bounds. The Node server composites it."""
    rgb, alpha = extract(src, cfg, segmenter)
    cut = cutout(Image.fromarray(rgb), alpha)
    return cut.crop(cut.getchannel("A").getbbox())


def process(
    src: str | Path | bytes | BinaryIO,
    cfg: Config,
    preset: Preset,
    background: str | None = None,
    reflection: bool | None = None,
    style: str | None = None,
    segmenter: Segmenter | None = None,
) -> Image.Image:
    rgb, alpha = extract(src, cfg, segmenter)
    c = cfg.composite
    refl = c.reflection if reflection is None else reflection
    bg = background or c.background
    tint = light_tint(rgb, alpha > 250) if bg == "match" else (255, 255, 255)
    cut = cutout(Image.fromarray(rgb), alpha)
    return composite(cut, preset.size, bg, c.padding, c.shadow, refl, style or c.style, c.sharpen, tint)
