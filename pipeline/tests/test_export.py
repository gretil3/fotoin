import io

import numpy as np
import pytest
from PIL import Image

from fotoin.config import load_config
from fotoin.export import encode
from fotoin.pipeline import NoProductError, process, product_cutout

CFG = load_config()


def _photo() -> bytes:
    img = Image.new("RGB", (900, 600), (180, 140, 90))
    img.paste((200, 40, 40), (300, 150, 600, 450))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def fake_segmenter(img: Image.Image) -> np.ndarray:
    # Stands in for rembg: tests never load model weights.
    rgb = np.asarray(img).astype(int)
    return np.where(np.abs(rgb - (200, 40, 40)).sum(axis=2) < 60, 255, 0).astype(np.uint8)


@pytest.mark.parametrize("name", list(CFG.presets))
@pytest.mark.parametrize("bg", ["white", "gradient"])
def test_output_matches_preset(name, bg):
    preset = CFG.presets[name]
    data = encode(process(_photo(), CFG, preset, bg, segmenter=fake_segmenter), preset)
    out = Image.open(io.BytesIO(data))
    assert out.size == preset.size
    assert out.format == preset.format.upper()
    # Background corners stay near white; product sits in the middle.
    assert min(out.convert("RGB").getpixel((2, 2))) > 220
    r, g, b = out.convert("RGB").getpixel((preset.size[0] // 2, preset.size[1] // 2))
    assert r > 150 and g < 90


def test_no_product_raises():
    with pytest.raises(NoProductError):
        process(_photo(), CFG, CFG.presets["shopee"], segmenter=lambda img: np.zeros(img.size[::-1], np.uint8))


def test_product_cutout_is_cropped_transparent_product():
    cut = product_cutout(_photo(), CFG, segmenter=fake_segmenter)
    assert cut.mode == "RGBA"
    # Cropped to the 300x300 red square (give or take the choke/feather edge).
    assert abs(cut.width - 300) <= 4 and abs(cut.height - 300) <= 4
    r, g, b, a = cut.getpixel((cut.width // 2, cut.height // 2))
    assert a == 255 and r > 150 and g < 90
