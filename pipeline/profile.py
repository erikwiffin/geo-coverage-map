"""Data profiling report (SPEC §10 / M1): profile.md."""
from __future__ import annotations

import json
from urllib.parse import urlparse

import pandas as pd


def _md_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_(empty)_\n"
    cols = list(df.columns)
    lines = ["| " + " | ".join(map(str, cols)) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join("" if pd.isna(v) else str(v).replace("|", "\\|")[:60]
                                       for v in r) + " |")
    return "\n".join(lines) + "\n"


def _joined(attrs: pd.DataFrame, fields: list[str]) -> pd.Series:
    """'|'-joined key per row; null when every field is null. Robust to pandas' str dtype."""
    parts = attrs[fields].apply(lambda col: col.map(lambda v: "" if pd.isna(v) else
                                                    (str(int(v)) if isinstance(v, float)
                                                     and v == int(v) else str(v))))
    return parts.agg("|".join, axis=1).where(attrs[fields].notna().any(axis=1))


def key_diagnostics(attrs: pd.DataFrame, candidates: list) -> list[dict]:
    """For each report-key candidate: distinct values, coverage, and how often one key value
    maps to several values of the other candidates (one doc = many projects, etc.)."""
    out = []
    flat = [c if isinstance(c, list) else [c] for c in candidates]
    for fields in flat:
        if not set(fields) <= set(attrs.columns):
            out.append({"key": "+".join(fields), "note": "field(s) missing"})
            continue
        k = _joined(attrs, fields)
        row = {"key": "+".join(fields), "non_null_pct": round(100 * k.notna().mean(), 1),
               "distinct": int(k.nunique())}
        for other in flat:
            if other == fields or not set(other) <= set(attrs.columns):
                continue
            o = _joined(attrs, other)
            g = pd.DataFrame({"k": k, "o": o}).dropna().groupby("k")["o"].nunique()
            row[f"values_with_>1 {'+'.join(other)}"] = int((g > 1).sum())
        out.append(row)
    return out


def profile_source(src: dict, records: list[dict], norm: pd.DataFrame, extra: dict) -> str:
    attrs = pd.DataFrame([r["attrs"] for r in records])
    fm = src.get("field_map", {})
    s = [f"## {src.get('name', src['id'])} (`{src['id']}`)\n",
         f"- URL: {src.get('url') or src.get('path')}",
         f"- Tier {src['tier']}, kind `{src['kind']}`",
         f"- Raw records in envelope: **{len(records)}**; after cleaning: **{len(norm)}**"]
    if norm is not None and len(norm):
        flags = pd.Series([f for fl in norm["flags"] for f in fl]).value_counts()
        s.append(f"- Flags: {dict(flags) if len(flags) else 'none'}")
    if attrs.empty:
        return "\n".join(s) + "\n"

    nulls = attrs.isna().mean().mul(100).round(1).rename("null_%").reset_index()
    nulls.columns = ["field", "null_%"]
    s += ["", "### Null rate per field", "", _md_table(nulls)]

    tf = fm.get("type")
    if tf and tf in attrs:
        vc = attrs[tf].fillna("(null)").value_counts().rename_axis(tf).reset_index(name="n")
        s += [f"### `{tf}` distribution", "", _md_table(vc)]
    s += ["### Normalized boring_type", "",
          _md_table(norm["boring_type"].value_counts().rename_axis("type").reset_index(name="n"))]

    if len(norm):
        fmts = norm["date_format"].value_counts().rename_axis("format").reset_index(name="n")
        parsed = norm["year"].notna().mean() * 100
        s += [f"### Date formats (field `{fm.get('date')}`)", "",
              f"Share with a parsed year: **{parsed:.1f}%**; "
              f"undated: **{norm['year'].isna().sum()}**.", "", _md_table(fmts)]
        unparsed = norm.loc[norm["date_format"] == "unparsed", "date_raw"].head(10).tolist()
        if unparsed:
            s += [f"Unparsed examples: `{unparsed}`", ""]
        yr = norm["year"].dropna().astype(int)
        if len(yr):
            s += [f"Year range: {yr.min()}–{yr.max()}, median {int(yr.median())}.", ""]

    if src.get("report_key"):
        keyed_attrs = attrs.copy()
        from .normalize import NORMALIZERS
        for f, n in (src.get("normalize_fields") or {}).items():
            if f in keyed_attrs:
                keyed_attrs[f] = keyed_attrs[f].map(
                    lambda v, fn=NORMALIZERS[n]: None if pd.isna(v) else fn(v))
        s += ["### Report-key candidates", "",
              f"Normalized before keying: {src.get('normalize_fields') or 'nothing'}.", "",
              _md_table(pd.DataFrame(key_diagnostics(keyed_attrs, src["report_key"])))]

    du = fm.get("doc_url")
    if du and du in attrs:
        def host(u):
            u = str(u)
            if u.startswith("\\\\"):
                return "UNC share \\\\" + u.lstrip("\\").split("\\")[0]
            return urlparse(u).netloc or "(relative/none)"
        hosts = attrs[du].dropna().map(host)
        vc = hosts.value_counts().rename_axis("host").reset_index(name="n")
        s += [f"### Hostnames in `{du}`", "", _md_table(vc)]
        ex = attrs[du].dropna().drop_duplicates().head(5).tolist()
        s += ["Examples: " + ", ".join(f"<{e}>" for e in ex), ""]

    if "attachments" in extra:
        att = json.dumps(extra["attachments"], indent=1)
        s += ["### Layer attachments", "", f"```\n{att}\n```", ""]

    show = [c for c in ["boring_uid", "boring_type", "boring_name", "date_raw", "year",
                        "depth_ft", "report_key", "doc_url", "lon", "lat"] if c in norm]
    s += ["### Sample rows (10)", "", _md_table(norm[show].head(10).round(6))]
    return "\n".join(s) + "\n"
