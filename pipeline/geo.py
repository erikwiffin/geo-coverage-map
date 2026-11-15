"""Small geodesy helpers shared by the pipeline."""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

EARTH_R = 6_371_008.8  # mean Earth radius, metres (matches h3 / haversine conventions)


def unit_xyz(lon, lat) -> np.ndarray:
    lon = np.radians(np.asarray(lon, dtype=float))
    lat = np.radians(np.asarray(lat, dtype=float))
    c = np.cos(lat)
    return np.column_stack([c * np.cos(lon), c * np.sin(lon), np.sin(lat)])


def chord_to_m(chord):
    return 2 * EARTH_R * np.arcsin(np.clip(np.asarray(chord) / 2, 0, 1))


def m_to_chord(m):
    return 2 * np.sin(np.asarray(m, dtype=float) / (2 * EARTH_R))


class SphereIndex:
    """Exact great-circle nearest-neighbour / radius queries via a KD-tree on unit vectors."""

    def __init__(self, lon, lat):
        self.n = len(lon)
        self.tree = cKDTree(unit_xyz(lon, lat)) if self.n else None

    def nearest_m(self, lon, lat) -> np.ndarray:
        if not self.n:
            return np.full(len(lon), np.inf)
        d, _ = self.tree.query(unit_xyz(lon, lat), k=1)
        return chord_to_m(d)

    def within(self, lon, lat, radius_m) -> list[list[int]]:
        if not self.n:
            return [[] for _ in range(len(lon))]
        return self.tree.query_ball_point(unit_xyz(lon, lat), float(m_to_chord(radius_m)))


def haversine_m(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = (np.sin((lat2 - lat1) / 2) ** 2
         + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_R * np.arcsin(np.sqrt(a))


def expand_bbox(bbox, metres):
    xmin, ymin, xmax, ymax = bbox
    dlat = np.degrees(metres / EARTH_R)
    dlon = dlat / np.cos(np.radians((ymin + ymax) / 2))
    return (xmin - dlon, ymin - dlat, xmax + dlon, ymax + dlat)
