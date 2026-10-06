import argparse
import sys
from pathlib import Path

from fotoin.config import DEFAULT_CONFIG, load_config
from fotoin.export import FORMATS, encode
from fotoin.pipeline import NoProductError, process
from fotoin.segment import RembgSegmenter


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="fotoin", description="Raw product photo -> marketplace-ready image.")
    p.add_argument("inputs", nargs="*", type=Path)
    p.add_argument("--preset", default="shopee")
    p.add_argument("--bg", choices=["white", "gradient"], help="override config background")
    p.add_argument("-o", "--out-dir", type=Path, help="default: next to each input")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--download-models", action="store_true", help="fetch model weights once, then run offline")
    a = p.parse_args(argv)

    cfg = load_config(a.config)
    if a.download_models:
        RembgSegmenter(cfg.segment.model, cfg.segment.model_dir, allow_download=True)
        print(f"model '{cfg.segment.model}' ready in {cfg.segment.model_dir}")
        if not a.inputs:
            return 0
    if not a.inputs:
        p.error("no input images")
    if a.preset not in cfg.presets:
        p.error(f"unknown preset '{a.preset}', choose from: {', '.join(cfg.presets)}")

    preset, failed = cfg.presets[a.preset], 0
    for path in a.inputs:
        try:
            img = process(path, cfg, preset, a.bg)
        except NoProductError:
            print(f"{path}: no product detected, skipped", file=sys.stderr)
            failed += 1
            continue
        out = (a.out_dir or path.parent) / f"{path.stem}_{a.preset}{FORMATS[preset.format][0]}"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(encode(img, preset))
        print(out)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
