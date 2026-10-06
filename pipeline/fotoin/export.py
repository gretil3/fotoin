import io

from PIL import Image

from fotoin.config import Preset

FORMATS = {"jpeg": (".jpg", "image/jpeg"), "png": (".png", "image/png")}


def encode(img: Image.Image, preset: Preset) -> bytes:
    if img.size != preset.size:
        img = img.resize(preset.size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if preset.format == "png":
        img.save(buf, "PNG", optimize=True)
    else:
        img.save(buf, "JPEG", quality=preset.quality, subsampling=0, optimize=True, progressive=True)
    return buf.getvalue()
