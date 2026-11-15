"""Geosetta adapter (phase M5): not implemented yet.

Before implementing, read https://geosetta.org/api_docs/ ; do not guess the payload.
Known constraints from the spec: radius queries capped at 5 km and 500 borings per call,
100 requests/hour, tier 4 (terms of use), disclaimer must travel with outputs.
"""
from __future__ import annotations

import os


class SourceSkipped(Exception):
    pass


def fetch(src: dict, ctx, bbox) -> list[dict]:
    if not os.environ.get("GEOSETTA_API_KEY"):
        raise SourceSkipped("GEOSETTA_API_KEY not set")
    raise NotImplementedError("Geosetta adapter is planned for M5")
