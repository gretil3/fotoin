# FOTOIN pipeline

Raw product photo → marketplace-ready image (Shopee / Tokopedia / TikTok Shop).
Runs locally on CPU. No paid APIs, and no network after the one-time model download.
Product pixels are cut out and color-corrected, never regenerated.

```
load → segment (rembg / U2-Net) → color_correct → composite → export
```

## Setup

```bash
cd pipeline
uv venv -p 3.12 .venv            # onnxruntime wheels may lag the newest Python
uv pip install --python .venv/bin/python -e .
.venv/bin/fotoin --download-models   # once, ~176 MB into pipeline/models/
```

Without uv: `python3.12 -m venv .venv && .venv/bin/pip install -e .`

## Usage

```bash
.venv/bin/fotoin input.jpg --preset shopee --bg white
.venv/bin/fotoin photos/*.jpg --preset tokopedia --bg gradient -o out/
.venv/bin/fotoin input.jpg --reflection     # faint glossy-floor mirror under the product
.venv/bin/fotoin input.jpg --style flatlay  # photo shot straight down: soft shadow all around
.venv/bin/fotoin input.jpg --bg match       # pale backdrop tinted to the light on the product
```

Output goes next to each input as `<name>_<preset>.jpg` unless `-o` is given.

API (for the WhatsApp bot later):

```bash
.venv/bin/uvicorn fotoin.api:app --port 8000
curl -F file=@input.jpg "localhost:8000/process?preset=shopee&bg=white" -o out.jpg
curl -F file=@input.jpg localhost:8000/cutout -o product.png   # transparent product only
```

`/cutout` is what the Node server's `IMAGE_PROVIDER=local` calls; the server adds the style
background and exact marketplace sizes itself.

Errors come back as `{"detail": {"code": "...", "message": "<Bahasa Indonesia>"}}`, with codes
`PRESET_TIDAK_DIKENAL`, `FOTO_TERLALU_BESAR`, `FOTO_TIDAK_VALID`, `PRODUK_TIDAK_TERDETEKSI`.

Seller shooting guide (Bahasa, ready to send on WhatsApp): `PANDUAN_FOTO.md`.

## Config

Everything lives in `config.yaml`: presets, which color steps run, the segmentation model and the
background. Set `FOTOIN_CONFIG` to point the API at another file.

Model options, all permissively licensed: `u2net` (default, 176 MB), `silueta` (43 MB), `u2netp`
(5 MB, rougher), `birefnet-general-lite` (MIT, sharper edges, slower). Never use `bria-rmbg`
(RMBG-1.4/2.0): its license is non-commercial. Change `segment.model` and rerun `--download-models`.

## Tests

```bash
.venv/bin/pytest -q tests
```

Tests use a fake segmenter, so they never load model weights or touch the network.

## Known limits

Checked on real photos (white paper cup, clear plastic cup, earbuds case), 2026-10-06.

- **White balance** is computed from the product's near-neutral pixels only. A product with no
  white, gray or black parts is left uncorrected rather than wrongly tinted. Strong warm light is
  only partly corrected (`color.wb_max_shift`), because a white product under yellow light looks
  the same as a cream product.
- **Clear / transparent products (confirmed)**: the mask is opaque, so the old background (windows,
  chairs) stays visible through the product. No classical fix: shoot transparent products in front
  of a plain white wall or paper so the see-through areas are already white.
- **Small product in frame / WhatsApp-compressed photos**: the product gets upscaled 3-5x and looks
  soft. Fill the frame when shooting, and send photos as a document, not as a photo.
- **Background touching the product** (e.g. something behind a straw tip) can get fused into the
  cutout. The reviewer has to catch it.
- **Product cut off by the photo edge** (e.g. a straw): stays cut off. Keep the whole product in frame.
- **Camera angle**: `standing` needs a photo at product height, `flatlay` one shot straight down.
  A ~45° photo fits neither and looks off in both; the pixels can't be re-angled without
  regenerating the product. Reshoot, or let the reviewer reject it.
- **White-on-white**: a white cup against a light wall segmented fine. A white product on a white
  sheet is untested and may clip edges or fail with `PRODUK_TIDAK_TERDETEKSI`.
