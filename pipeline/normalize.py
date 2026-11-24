"""Source records -> common boring schema (SPEC §5.1) and cleaning (§5.2)."""
from __future__ import annotations

import json
import numbers
import re
from datetime import UTC, date, datetime

import numpy as np
import pandas as pd

from .geo import SphereIndex

SCHEMA = [
    "boring_uid", "source_id", "tier", "kind", "boring_type", "boring_name",
    "date_raw", "date", "year", "date_format", "depth_ft", "elev", "gw", "report_key",
    "doc_url", "doc_internal", "doc_name", "n_attachments", "project", "fin", "consultant",
    "lon", "lat", "flags", "also_in", "log", "log_from", "site_id", "details",
    "rights", "rights_detail", "location_precision", "attrs",
]
# Records flagged with this are drawn and labelled but never count toward coverage (e.g. a
# journal article Geosetta geocoded to the author's university).
NO_COVERAGE_FLAG = "not_site_data"
# Filled from a merged duplicate when the kept record lacks them (e.g. Geosetta's parsed log
# depth/N-values attached to the matching FDOT boring).
ENRICH = ["depth_ft", "log"]

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
    if isinstance(raw, numbers.Number) and not isinstance(raw, bool):  # incl. numpy ints
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
    ("Site", re.compile(r"^SITE$", re.I)),
    ("Document", re.compile(r"^DOCUMENT$", re.I)),
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


NORMALIZERS = {
    "digits": lambda v: re.sub(r"\D", "", str(v)) or None,
    "upper": lambda v: str(v).strip().upper() or None,
}


def normalize_source(records: list[dict], src: dict, county_bbox=None) -> pd.DataFrame:
    fm = src.get("field_map", {})
    norms = {f: NORMALIZERS[n] for f, n in (src.get("normalize_fields") or {}).items()}
    internal = [re.compile(p) for p in src.get("internal_doc_patterns") or []]

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
        keyed = {k: (norms[k](v) if k in norms and _clean(v) is not None else v)
                 for k, v in a.items()}
        rk = report_key(keyed, src.get("report_key")) if src.get("report_key") else None
        doc = get(a, "doc_url")
        doc_internal = None
        if doc is not None and any(rx.search(str(doc)) for rx in internal):
            doc, doc_internal = None, str(doc)
        atts = r.get("attachments")
        if atts:  # public copies served by the layer itself (e.g. FDOT's MapServer attachments)
            pdfs = [a for a in atts if (a.get("contentType") or "").endswith("pdf")] or atts
            doc = pdfs[0]["url"]
        elif src.get("attachments_page") and doc is None and native_id is not None:
            # no saved attachment index: link the layer's attachment listing page for the feature
            doc = f"{src['url']}/{_fmt(native_id)}/attachments"
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
            "doc_url": doc,
            "doc_internal": doc_internal,
            "doc_name": None if get(a, "doc_name") is None else str(get(a, "doc_name")),
            "n_attachments": len(atts) if atts is not None else None,
            "project": None if get(a, "project") is None else str(get(a, "project")),
            "fin": None if get(a, "fin") is None else str(get(a, "fin")),
            "consultant": get(a, "consultant"),
            "lon": _num(r.get("lon")),
            "lat": _num(r.get("lat")),
            "flags": (list(a.get("flags") or []) if src.get("adapter") in ("diggs", "geosetta")
                      else [])
            + (["approx_location"] if any(_clean(a.get(f)) in vals for f, vals in
                                          (src.get("approx_when") or {}).items()) else []),
            "also_in": [],
            "log": json.dumps(get(a, "log"), default=str) if get(a, "log") else None,
            "log_from": src["id"] if get(a, "log") else None,
            "site_id": None if get(a, "site_id") is None
            else f"{src.get('site_id_prefix', '')}{_fmt(get(a, 'site_id'))}",
            "details": json.dumps({k: _fmt(a[f]) for k, f in (src.get("details") or {}).items()
                                   if _clean(a.get(f)) is not None}) if src.get("details")
            else None,
            # what we may do with the record: a per-document label wins over the source's
            "rights": _clean(a.get("rights")) or _clean(src.get("rights")),
            "rights_detail": _clean(a.get("rights_detail")),
            "location_precision": _clean(a.get("location_precision")),
            "attrs": json.dumps(a, default=str),
        })
    df = pd.DataFrame(rows, columns=SCHEMA)
    if src.get("collapse_on_site_id") and not df.empty:
        # several records per facility (e.g. discharges): keep the earliest-dated one
        df = (df.sort_values("date", na_position="last")
              .drop_duplicates("site_id", keep="first") if df["site_id"].notna().all()
              else df)
    if src.get("flag_colocated") and not df.empty:
        key = df["lon"].round(7).astype(str) + "," + df["lat"].round(7).astype(str)
        shared = key.duplicated(keep=False)
        df["flags"] = [f + ["approx_location"] if sh and "approx_location" not in f else f
                       for f, sh in zip(df["flags"], shared, strict=True)]
    return clean(df, county_bbox, collapse_colocated=not src.get("keep_colocated"))


def clean(df: pd.DataFrame, county_bbox=None, collapse_colocated: bool = True) -> pd.DataFrame:
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
    if collapse_colocated:
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
    # records from different sources that share an agency site id are the same site, wherever
    # each source put the point
    if "site_id" in df:
        by_site: dict[str, list[int]] = {}
        for i, sid in df["site_id"].items():
            if sid is not None and not pd.isna(sid):
                by_site.setdefault(str(sid), []).append(i)
        for members in by_site.values():
            for i in members:
                neigh[i] = list(neigh[i]) + [j for j in members if j != i]
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
                for col in ENRICH:
                    if col in df and pd.isna(df.at[i, col]) and not pd.isna(df.at[j, col]):
                        df.at[i, col] = df.at[j, col]
                        if col == "log":
                            df.at[i, "log_from"] = df.at[j, "log_from"]
    df["also_in"] = [also[i] for i in df.index]
    return df.drop(index=sorted(dropped)).reset_index(drop=True)
