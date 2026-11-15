"""CLI: python -m pipeline {check-network,fetch,build,stats,all} [--area CONFIG] [--refresh]"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import UTC, datetime
from urllib.parse import urlparse

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import shape

from . import config as cfgmod
from .arcgis import FetchError, RemoteBlocked, SandboxBlocked, classify_response, make_client
from .coverage import compute_stats, make_grid, plot_curve
from .geo import expand_bbox
from .normalize import dedupe_across_sources, normalize_source
from .profile import profile_source
from .reports import build_reports
from .sources import ADAPTERS
from .sources.geosetta import SourceSkipped

log = logging.getLogger("pipeline")


def _now():
    return datetime.now(UTC).isoformat(timespec="seconds")


# --------------------------------------------------------------------- check-network
def check_network(ctx) -> int:
    urls = [ctx.area["boundary"]["url"]] + [s["url"] for s in ctx.sources if s.get("url")]
    if ctx.area.get("basemap_style"):
        urls.append(ctx.area["basemap_style"])
    ua = make_client(ctx).session.headers["User-Agent"]
    worst = 0
    for url in dict.fromkeys(urls):
        probe = url + ("?f=json" if "/rest/services/" in url else "")
        try:
            r = requests.get(probe, headers={"User-Agent": ua}, timeout=30)
            kind = classify_response(r)
            msg = {"ok": "reachable", "sandbox_blocked": "BLOCKED by sandbox allowlist",
                   "remote_blocked": "BLOCKED by remote host (firewall/WAF)",
                   "error": f"error HTTP {r.status_code}"}[kind]
            if kind == "ok" and "/rest/services/" in url:
                try:
                    r.json()
                except ValueError:
                    kind, msg = "error", "responded, but not JSON"
        except requests.RequestException as e:
            kind, msg = "error", f"error: {e.__class__.__name__}"
            if "403" in str(e) or "Tunnel" in str(e):
                kind, msg = "sandbox_blocked", "BLOCKED by sandbox allowlist (proxy refused)"
        worst = max(worst, 0 if kind == "ok" else 1)
        print(f"{msg:<40} {urlparse(url).netloc:<28} {url}")
    return worst


# --------------------------------------------------------------------- fetch
def fetch(ctx) -> None:
    client = make_client(ctx)
    b = ctx.area["boundary"]
    data = client.request(b["url"] + "/query", {
        "f": "geojson", "where": b["where"], "outFields": "*", "outSR": "4326"})
    if not data.get("features"):
        raise SystemExit(f"boundary query returned no features: {b['where']}")
    ctx.out_dir.mkdir(parents=True, exist_ok=True)
    (ctx.out_dir / "boundary.geojson").write_text(json.dumps(data))
    geom = shape(data["features"][0]["geometry"])
    bbox = expand_bbox(geom.bounds, ctx.area.get("envelope_buffer_m", 1000))
    manifest = {"area": ctx.area["id"], "generated": _now(), "bbox_fetch": bbox,
                "boundary": {"url": b["url"], "where": b["where"], "license": b.get("license"),
                             "fetched": _now(),
                             "attributes": data["features"][0].get("properties")},
                "sources": {}}
    for src in ctx.sources:
        entry = {k: src.get(k) for k in ("name", "url", "homepage", "tier", "kind", "license",
                                          "disclaimer")}
        entry["default_on"] = src.get("default_on", True)
        try:
            log.info("fetching %s", src["id"])
            recs = ADAPTERS[src["adapter"]](src, ctx, bbox)
            (ctx.raw_dir / f"{src['id']}.records.json").write_text(json.dumps(recs, default=str))
            entry.update(status="ok", fetched=_now(), n_raw=len(recs))
            extra = {}
            if src["adapter"] == "arcgis" and recs:
                extra["attachments"] = _attachment_probe(client, src, recs)
            (ctx.raw_dir / f"{src['id']}.extra.json").write_text(json.dumps(extra))
        except (SourceSkipped, FileNotFoundError) as e:
            entry.update(status="skipped", reason=str(e))
        except (RemoteBlocked, SandboxBlocked, FetchError) as e:
            entry.update(status="failed", reason=str(e))
            log.error("source %s failed: %s", src["id"], e)
        manifest["sources"][src["id"]] = entry
    (ctx.raw_dir / "fetch_manifest.json").write_text(json.dumps(manifest, indent=1))


def _attachment_probe(client, src, recs, n=5) -> dict:
    info = client.layer_info(src["url"])
    out = {"hasAttachments": info.get("hasAttachments")}
    if not info.get("hasAttachments"):
        return out
    oid = src.get("field_map", {}).get("native_id", "OBJECTID")
    sample = [r["attrs"][oid] for r in recs[:: max(1, len(recs) // n)][:n]]
    found = {}
    for o in sample:
        try:
            d = client.request(f"{src['url']}/{o}/attachments", {"f": "json"})
            found[str(o)] = [{"name": a.get("name"), "contentType": a.get("contentType"),
                              "size": a.get("size")} for a in d.get("attachmentInfos", [])]
        except FetchError as e:
            found[str(o)] = f"error: {e}"
    out["sample"] = found
    return out


# --------------------------------------------------------------------- build
def build(ctx) -> None:
    man = json.loads((ctx.raw_dir / "fetch_manifest.json").read_text())
    frames, profiles = [], []
    for src in ctx.sources:
        entry = man["sources"].get(src["id"], {})
        path = ctx.raw_dir / f"{src['id']}.records.json"
        if entry.get("status") != "ok" or not path.exists():
            profiles.append(f"## {src.get('name', src['id'])} (`{src['id']}`)\n\n"
                            f"**Not available:** {entry.get('status')} — {entry.get('reason')}\n")
            continue
        recs = json.loads(path.read_text())
        df = normalize_source(recs, src, ctx.area.get("county_bbox"))
        entry["n_in_area"] = len(df)
        extra_p = ctx.raw_dir / f"{src['id']}.extra.json"
        extra = json.loads(extra_p.read_text()) if extra_p.exists() else {}
        profiles.append(profile_source(src, recs, df, extra))
        frames.append(df)
    borings = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if not borings.empty:
        borings = dedupe_across_sources(borings, ctx.area.get("dedupe_m", 5),
                                        [s["id"] for s in ctx.sources])
    for sid, entry in man["sources"].items():
        if entry.get("status") == "ok":
            entry["n_after_dedupe"] = int((borings["source_id"] == sid).sum()) \
                if not borings.empty else 0
    out = ctx.out_dir
    out.mkdir(parents=True, exist_ok=True)
    gdf = gpd.GeoDataFrame(borings, geometry=gpd.points_from_xy(borings.lon, borings.lat),
                           crs=4326) if not borings.empty else gpd.GeoDataFrame(
        columns=["geometry"], geometry="geometry", crs=4326)
    if not borings.empty:
        gdf.to_parquet(out / "borings.parquet")
        web = gdf.drop(columns=["attrs"]).copy()
        for c in ("flags", "also_in"):
            web[c] = web[c].map(lambda v: ",".join(v) if v else None)
        web["lon"], web["lat"] = web["lon"].round(6), web["lat"].round(6)
        (out / "borings.geojson").write_text(web.to_json(drop_id=True, na="drop"))
        reports = build_reports(borings, ctx.area.get("report_buffer_m", 30),
                                ctx.area.get("report_span_flag_km", 5))
        rep = reports.copy()
        rep["hull"] = rep["hull"].map(lambda h: json.dumps(h) if h else None)
        rep["types"] = rep["types"].map(",".join)
        rep.geometry = rep.geometry.simplify(0.000005)
        (out / "reports.geojson").write_text(rep.to_json(drop_id=True, na="drop"))
        flagged = reports[reports["flag_span"]]
        n_keyed = int(borings["report_key"].notna().sum())
        assert int(reports["n_borings"].sum()) == n_keyed, "report membership mismatch"
        profiles.append(
            "## Reports (M2)\n\n"
            f"- Reports built: **{len(reports)}**; borings in reports: **{n_keyed}** "
            f"(= sum of n_borings: {int(reports['n_borings'].sum())}); "
            f"borings without a key: **{int(borings['report_key'].isna().sum())}**.\n"
            f"- Reports spanning > {ctx.area.get('report_span_flag_km', 5)} km "
            f"(corridor project or bad key): **{len(flagged)}**\n\n"
            + (pd.DataFrame(flagged[["report_key", "n_borings", "span_m"]]).to_markdown(
                index=False) if len(flagged) and _has_tabulate() else
               "\n".join(f"  - `{r.report_key}` — {r.n_borings} borings, {r.span_m:.0f} m"
                         for r in flagged.itertuples())) + "\n")
    else:
        for name in ("borings.geojson", "reports.geojson"):
            (out / name).write_text('{"type":"FeatureCollection","features":[]}')
    man["built"] = _now()
    man["basemap_style"] = ctx.area.get("basemap_style")
    (out / "manifest.json").write_text(json.dumps(man, indent=1))
    (out / "profile.md").write_text(
        f"# Data profile: {ctx.area['name']}\n\nGenerated {_now()}.\n\n"
        + "\n".join(profiles))
    log.info("built %d borings", len(borings))


def _has_tabulate() -> bool:
    try:
        import tabulate  # noqa: F401
        return True
    except ImportError:
        return False


# --------------------------------------------------------------------- stats
def stats(ctx) -> None:
    out = ctx.out_dir
    boundary = shape(json.loads((out / "boundary.geojson").read_text())["features"][0]["geometry"])
    man = json.loads((out / "manifest.json").read_text())
    pq = out / "borings.parquet"
    borings = pd.read_parquet(pq) if pq.exists() else pd.DataFrame(
        columns=["tier", "boring_type", "source_id", "kind", "year", "report_key", "lon", "lat"])
    default_sources = [s["id"] for s in ctx.sources if s.get("default_on", True)]
    grid = make_grid(boundary, ctx.h3_resolution)
    st, extras = compute_stats(grid, borings, ctx.area, default_sources)
    st["generated"] = _now()
    st["sources_status"] = {k: v.get("status") for k, v in man["sources"].items()}
    (out / "stats.json").write_text(json.dumps(st, indent=1))
    gaps_fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {k: v for k, v in g.items() if k != "cells"},
         "geometry": _cells_to_geojson(g["cells"])} for g in extras["gaps"]]}
    (out / "gaps.geojson").write_text(json.dumps(gaps_fc))
    plot_curve(extras["curves"], grid.area_m2, out / "coverage_curve.png",
               f"{ctx.area['name']}: area within R of a public boring")
    log.info("coverage at %s m: %s%%", ctx.area.get("default_radius_m"),
             st["pct_covered"].get(str(ctx.area.get("default_radius_m"))))


def _cells_to_geojson(cells):
    import h3
    return h3.cells_to_geo(cells)


# --------------------------------------------------------------------- main
def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="pipeline")
    p.add_argument("command", choices=["check-network", "fetch", "build", "stats", "all"])
    p.add_argument("--area", default=str(cfgmod.ROOT / "config" / "area.gainesville.yaml"))
    p.add_argument("--sources", default=None)
    p.add_argument("--refresh", action="store_true", help="ignore the raw cache and refetch")
    p.add_argument("--web", action="store_true", help="also copy outputs to web/public/data")
    p.add_argument("-v", "--verbose", action="store_true")
    a = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO,
                        format="%(levelname)s %(message)s")
    ctx = cfgmod.load(a.area, a.sources)
    ctx.refresh = a.refresh
    ctx.raw_dir.mkdir(parents=True, exist_ok=True)
    if a.command == "check-network":
        return check_network(ctx)
    if a.command in ("fetch", "all"):
        fetch(ctx)
    if a.command in ("build", "all"):
        build(ctx)
    if a.command in ("stats", "all"):
        stats(ctx)
    if a.web or a.command == "all":
        dest = cfgmod.ROOT / "web" / "public" / "data"
        dest.mkdir(parents=True, exist_ok=True)
        for f in ("boundary.geojson", "borings.geojson", "reports.geojson", "gaps.geojson",
                  "stats.json", "manifest.json"):
            if (ctx.out_dir / f).exists():
                shutil.copy(ctx.out_dir / f, dest / f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
