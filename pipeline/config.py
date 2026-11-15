from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Ctx:
    """Run context shared across pipeline steps."""

    area: dict
    sources: list[dict]
    raw_dir: Path = ROOT / "data" / "raw"
    out_dir: Path = ROOT / "data" / "processed"
    refresh: bool = False
    manifest: dict = field(default_factory=dict)

    @property
    def h3_resolution(self) -> int:
        res = self.area.get("h3_resolution", "auto")
        if res == "auto":
            return 11 if min(self.area["radii_m"]) < 100 else 10
        return int(res)


def load(area_path: str | Path, sources_path: str | Path | None = None) -> Ctx:
    area_path = Path(area_path)
    area = yaml.safe_load(area_path.read_text())
    sources_path = Path(sources_path or area_path.parent / "sources.yaml")
    registry = {s["id"]: s for s in yaml.safe_load(sources_path.read_text())}
    wanted = area.get("sources") or list(registry)
    missing = [s for s in wanted if s not in registry]
    if missing:
        raise SystemExit(f"area config references unknown sources: {missing}")
    return Ctx(area=area, sources=[registry[s] for s in wanted])
