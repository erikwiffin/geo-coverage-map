# FDOT D2 soil borings: browser-saved query pages

`gis.fdot.gov` returns 403 to scripts (Azure WAF), even from a home connection, but works in a
browser. To refresh the data:

1. Print the URLs (they're built from the boundary envelope and the pages already saved here):

   ```bash
   python -m pipeline manual-urls
   ```

2. Open each URL in a browser and save the response into this folder:
   - feature pages: any name, e.g. `page0.json`, `page1.json` (1000 records per page)
   - the attachment index: `attachments.json` (or `attachments1.json`, `attachments2.json`, ...)
3. Run `python -m pipeline build && python -m pipeline stats --web`, or `python -m pipeline all`.

`build` always re-reads this folder, so you don't need to re-run `fetch` after adding files. Files
are de-duplicated by OBJECTID, so overlapping pages are harmless.

Without `attachments.json`, each boring links to its attachment listing page
(`.../MapServer/0/<OBJECTID>/attachments`). With it, each boring links straight to its PDF.

`layer.json` is the layer metadata (`?f=pjson`, saved 2026-11-15; renderer images stripped).
