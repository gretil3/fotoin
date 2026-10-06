"""HTTP entry point. The WhatsApp bot (later) posts the seller's photo here and sends back the result.

Run: uvicorn fotoin.api:app --port 8000
"""

import io
import os
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError

from fotoin.config import DEFAULT_CONFIG, load_config
from fotoin.export import FORMATS, encode
from fotoin.pipeline import NoProductError, get_segmenter, process, product_cutout

MAX_UPLOAD = 15 * 1024 * 1024

cfg = load_config(os.environ.get("FOTOIN_CONFIG", DEFAULT_CONFIG))
get_segmenter(cfg.segment.model, cfg.segment.model_dir)  # fail at startup if weights are missing
app = FastAPI(title="FOTOIN")


def _fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message})


@app.post("/process")
def process_photo(
    file: UploadFile = File(...),
    preset: str = "shopee",
    bg: Literal["white", "gradient", "match"] | None = None,
    style: Literal["standing", "flatlay"] | None = None,
) -> Response:
    # Sync def on purpose: FastAPI runs it in a threadpool, so CPU-bound work doesn't block the loop.
    if preset not in cfg.presets:
        raise _fail(400, "PRESET_TIDAK_DIKENAL", f"Preset tidak dikenal. Pilih: {', '.join(cfg.presets)}.")
    data = _read(file)
    p = cfg.presets[preset]
    img = _run(lambda: process(data, cfg, p, bg, style=style))
    return Response(encode(img, p), media_type=FORMATS[p.format][1])


@app.post("/cutout")
def cutout_photo(file: UploadFile = File(...)) -> Response:
    """Transparent PNG of the corrected product, cropped to it. Used by the Node server's
    `local` image provider, which adds the style background and exact marketplace sizing."""
    img = _run(lambda: product_cutout(_read(file), cfg))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")


def _read(file: UploadFile) -> bytes:
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise _fail(413, "FOTO_TERLALU_BESAR", "Foto terlalu besar (maksimal 15 MB).")
    return data


def _run(work):
    try:
        return work()
    except (UnidentifiedImageError, Image.DecompressionBombError):
        raise _fail(400, "FOTO_TIDAK_VALID", "File bukan foto yang bisa dibaca.")
    except NoProductError:
        raise _fail(422, "PRODUK_TIDAK_TERDETEKSI", "Produk tidak terdeteksi. Coba foto ulang dengan latar polos.")
