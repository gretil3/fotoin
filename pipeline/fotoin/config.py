from dataclasses import dataclass, field
from pathlib import Path

import yaml

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config.yaml"


@dataclass(frozen=True)
class SegmentCfg:
    model: str = "u2net"
    model_dir: str = "models"
    min_blob_frac: float = 0.02
    choke_px: int = 1
    feather_px: float = 1.0


@dataclass(frozen=True)
class ColorCfg:
    white_balance: bool = True
    wb_max_shift: float = 0.12
    clahe: bool = True
    clahe_clip: float = 1.5
    exposure: bool = False
    exposure_target: float = 0.5
    reference: str | None = None


@dataclass(frozen=True)
class CompositeCfg:
    background: str = "white"
    padding: float = 0.10
    shadow: bool = True


@dataclass(frozen=True)
class Preset:
    size: tuple[int, int]
    format: str = "jpeg"
    quality: int = 92


@dataclass(frozen=True)
class Config:
    max_side: int = 2048
    segment: SegmentCfg = field(default_factory=SegmentCfg)
    color: ColorCfg = field(default_factory=ColorCfg)
    composite: CompositeCfg = field(default_factory=CompositeCfg)
    presets: dict[str, Preset] = field(default_factory=dict)


def load_config(path: str | Path = DEFAULT_CONFIG) -> Config:
    path = Path(path).resolve()
    raw = yaml.safe_load(path.read_text()) or {}
    seg = raw.get("segment", {})
    # Relative paths in the config resolve against the config file, not the cwd.
    seg["model_dir"] = str(path.parent / seg.get("model_dir", "models"))
    color = raw.get("color", {})
    if color.get("reference"):
        color["reference"] = str(path.parent / color["reference"])
    return Config(
        max_side=raw.get("max_side", 2048),
        segment=SegmentCfg(**seg),
        color=ColorCfg(**color),
        composite=CompositeCfg(**raw.get("composite", {})),
        presets={
            name: Preset(**{**p, "size": tuple(p["size"])})
            for name, p in raw.get("presets", {}).items()
        },
    )
