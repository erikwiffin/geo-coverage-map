"""Source records -> common boring schema (SPEC §5.1) and cleaning (§5.2)."""
from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime

import numpy as np
import pandas as pd

from .geo import SphereIndex

SCHEMA = [
    "boring_uid", "source_id", "tier", "kind", "boring_type", "boring_name",
    "date_raw", "date", "year", "date_format", "depth_ft", "elev", "gw", "report_key",
    "doc_url", "doc_name", "project", "consultant", "lon", "lat", "flags", "also_in", "attrs",
]

DATE_FORMATS = [
    ("%m/%d/%Y", r"^\d{1,2}/\d{1,2}/\d{4}$"),
    ("%m/%d/%y", r"^\d{1,2}/\d{1,2}/\d{2}$"),
    ("%Y-%m-%d", r"^\d{4}-\d{2}-\d{2}"),
    ("%Y/%m/%d", r"^\d{4}/\d{1,2}/\d{1,2}$"),
    ("%m-%d-%Y", r"^\d{1,2}-\d{1,2}-\d{4}$"),
    ("%Y%m%d", r"^(19|20)\d{6}$"),
    ("%m/%Y", r"^\d{1,2}/\d{4}$"),
    ("%b %d, %Y", r"^[A-Za-z]{3} \d{1,2}, \d{4}$"),
    ("%B %d, %Y", r"^[A-Za-z]{4,} \d{1,2}, \d{4}$"),
    ("%B %Y", r"^[A-Za-z]+ \d{4}$"),
    ("%Y", r"^(18|19|20)\d{2}$"),
]


def parse_date(raw) -> tuple[str | None, int | None, str | None]:
    """Return (iso_date_or_None, year_or_None, format_label). Never invents a value."""
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return None, None, "null"
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        v = float(raw)
        if abs(v) > 1e10:  # ArcGIS esriFieldTypeDate: epoch milliseconds
            d = datetime.fromtimestamp(v / 1000, tz=UTC).date()
            return d.isoformat(), d.year, "epoch_ms"
        if 1800 <= v <= 2100 and v == int(v):
            return None, int(v), "year_number"
        return None, None, "unparsed"
    s = str(raw).strip()
    if not s:
        return None, None, "null"
    for fmt, pat in DATE_FORMATS:
        if re.match(pat, s):
            try:
                txt = s[:10] if fmt == "%Y-%m-%d" else s
                d = datetime.strptime(txt, fmt).date()
            except ValueError:
                continue
            if not (1850 <= d.year <= date.today().year + 1):
                return None, None, "out_of_range"
            if fmt in ("%Y",):
                return None, d.year, fmt
            if fmt in ("%m/%Y", "%B %Y"):
                return None, d.year, fmt
            return d.isoformat(), d.year, fmt
    return None, None, "unparsed"


TYPE_RULES = [
    ("CPT", re.compile(r"\bCPT|CONE", re.I)),
    ("SPT", re.compile(r"\bSPT|STANDARD\s*PEN", re.I)),
    ("Auger", re.compile(r"AUG", re.I)),
    ("Well", re.compile(r"WELL", re.I)),
]


def normalize_type(raw) -> str:
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return "Other"
    for label, rx in TYPE_RULES:
        if rx.search(str(raw)):
            return label
    return "Other"


def _clean(v):
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def _fmt(v) -> str:
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def report_key(attrs: dict, spec: list) -> str | None:
    """First non-null entry of `spec` wins. Entries are field names or lists of field names.
    The key is labelled with the field(s) it came from so different key kinds never collide."""
    for entry in spec or []:
        fields = entry if isinstance(entry, list) else [entry]
        vals = [_clean(attrs.get(f)) for f in fields]
        if any(v is not None for v in vals):
            label = "+".join(fields)
            return f"{label}={'|'.join('' if v is None else _fmt(v) for v in vals)}"
    return None


def _num(v):
    v = _clean(v)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def normalize_source(records: list[dict], src: dict, county_bbox=None) -> pd.DataFrame:
    fm = src.get("field_map", {})

    def get(attrs, key):
        f = fm.get(key, key if src.get("adapter") == "csv" else None)
        return _clean(attrs.get(f)) if f else None

    rows = []
    for r in records:
        a = r["attrs"]
        raw_date = get(a, "date")
        iso, year, fmt = parse_date(raw_date)
        if year is None and get(a, "year") is not None:
            y = _num(get(a, "year"))
            if y and 1850 <= y <= date.today().year + 1:
                year, fmt = int(y), (fmt if fmt != "null" else "year_field")
        native_id = get(a, "native_id")
        rk = report_key(a, src.get("report_key")) if src.get("report_key") else None
        if src.get("adapter") == "csv" and get(a, "report_key") is not None:
            rk = f"report_key={get(a, 'report_key')}"
        rows.append({
            "boring_uid": f"{src['id']}:{_fmt(native_id)}",
            "source_id": src["id"],
            "tier": int(get(a, "tier") or src["tier"]) if src.get("adapter") == "csv"
            else int(src["tier"]),
            "kind": (get(a, "kind") if src.get("adapter") == "csv" else None) or src["kind"],
            "boring_type": src.get("fixed_type") or normalize_type(get(a, "type")),
            "boring_name": None if get(a, "boring_name") is None else str(get(a, "boring_name")),
            "date_raw": None if raw_date is None else str(raw_date),
            "date": iso,
            "year": year,
            "date_format": fmt,
            "depth_ft": _num(get(a, "depth_ft")),
            "elev": _num(get(a, "elev")),
            "gw": _num(get(a, "gw")),
            "report_key": f"{src['id']}:{rk}" if rk else None,
            "doc_url": get(a, "doc_url"),
            "doc_name": None if get(a, "doc_name") is None else str(get(a, "doc_name")),
            "project": None if get(a, "project") is None else str(get(a, "project")),
            "consultant": get(a, "consultant"),
            "lon": _num(r.get("lon")),
            "lat": _num(r.get("lat")),
            "flags": [],
            "also_in": [],
            "attrs": json.dumps(a, default=str),
        })
    df = pd.DataFrame(rows, columns=SCHEMA)
    return clean(df, county_bbox)


def clean(df: pd.DataFrame, county_bbox=None) -> pd.DataFrame:
    if df.empty:
        return df
    bad = df["lon"].isna() | df["lat"].isna() | (df["lon"] == 0) | (df["lat"] == 0)
    df = df[~bad].copy()
    df["flags"] = [list(f) for f in df["flags"]]
    if county_bbox:
        x0, y0, x1, y1 = county_bbox
        inside = df["lon"].between(x0, x1) & df["lat"].between(y0, y1)
        swapped = df["lat"].between(x0, x1) & df["lon"].between(y0, y1)
        for i in df.index[~inside]:
            df.at[i, "flags"] = df.at[i, "flags"] + (
                ["swapped_latlon"] if swapped[i] else ["out_of_county"])
    # within-source exact duplicates: same coordinates + boring name
    key = df["lon"].round(7).astype(str) + "," + df["lat"].round(7).astype(str) + "," + \
        df["boring_name"].fillna("")
    df = df[~key.duplicated()].copy()
    return df


def _compatible(a: str, b: str) -> bool:
    return a == b or "Other" in (a, b)


def dedupe_across_sources(df: pd.DataFrame, radius_m: float,
                          source_order: list[str]) -> pd.DataFrame:
    """Points within radius_m of a point from *another* source with a compatible type are the
    same boring. Keep the lowest tier (ties: earlier source in the registry); record merges in
    `also_in`."""
    if df.empty or df["source_id"].nunique() < 2:
        return df.reset_index(drop=True)
    df = df.reset_index(drop=True)
    rank = {s: i for i, s in enumerate(source_order)}
    order = sorted(df.index, key=lambda i: (df.at[i, "tier"], rank.get(df.at[i, "source_id"], 99)))
    idx = SphereIndex(df["lon"].to_numpy(), df["lat"].to_numpy())
    neigh = idx.within(df["lon"].to_numpy(), df["lat"].to_numpy(), radius_m)
    dropped: set[int] = set()
    also = {i: [] for i in df.index}
    for i in order:
        if i in dropped:
            continue
        for j in neigh[i]:
            if j == i or j in dropped:
                continue
            if df.at[j, "source_id"] == df.at[i, "source_id"]:
                continue
            if _compatible(df.at[i, "boring_type"], df.at[j, "boring_type"]):
                dropped.add(j)
                also[i].append(df.at[j, "boring_uid"])
    df["also_in"] = [also[i] for i in df.index]
    return df.drop(index=sorted(dropped)).reset_index(drop=True)
