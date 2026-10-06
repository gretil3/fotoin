import io
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps


def load_image(src: str | Path | bytes | BinaryIO, max_side: int = 2048) -> Image.Image:
    """Open, apply EXIF rotation, flatten to RGB (transparency -> white), cap the longest side."""
    img = Image.open(io.BytesIO(src) if isinstance(src, bytes) else src)
    img = ImageOps.exif_transpose(img).convert("RGBA")
    flat = Image.alpha_composite(Image.new("RGBA", img.size, "white"), img).convert("RGB")
    flat.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return flat
