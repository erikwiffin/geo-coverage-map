import json
from pathlib import Path

import pytest
import yaml

FIX = Path(__file__).parent / "fixtures"
ROOT = Path(__file__).parent.parent


@pytest.fixture
def sources():
    return {s["id"]: s for s in yaml.safe_load((ROOT / "config" / "sources.yaml").read_text())}


@pytest.fixture
def area():
    return yaml.safe_load((ROOT / "config" / "area.gainesville.yaml").read_text())


def load_fixture(name):
    return json.loads((FIX / name).read_text())
