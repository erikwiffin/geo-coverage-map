import json

import pytest

from pipeline.arcgis import Client, RemoteBlocked, SandboxBlocked


class FakeResp:
    def __init__(self, status=200, body=None, headers=None, text=None):
        self.status_code = status
        self._body = body
        self.headers = {"content-type": "application/json", **(headers or {})}
        self.text = text if text is not None else json.dumps(body)
        self.content = self.text.encode()

    def json(self):
        return self._body


class FakeSession:
    def __init__(self, n_ids=1234):
        self.headers = {}
        self.calls = []
        self.ids = list(range(1, n_ids + 1))

    def get(self, url, params=None, timeout=None):
        self.calls.append(("GET", url, params))
        return FakeResp(body={"objectIds": self.ids})

    def post(self, url, data=None, timeout=None):
        self.calls.append(("POST", url, data))
        ids = [int(i) for i in data["objectIds"].split(",")]
        assert len(ids) <= 500 and data["outSR"] == "4326"
        return FakeResp(body={"features": [
            {"attributes": {"OBJECTID": i}, "geometry": {"x": -82.3, "y": 29.6}} for i in ids]})


def test_paged_fetch_and_cache(tmp_path):
    s = FakeSession()
    c = Client(tmp_path, "test-agent", max_rps=1000, session=s)
    feats = c.query_features("https://h/arcgis/rest/services/x/MapServer/0",
                             bbox=(-83, 29, -82, 30))
    assert len(feats) == 1234
    assert sum(1 for m, *_ in s.calls if m == "POST") == 3
    assert s.headers["User-Agent"] == "test-agent"
    n = len(s.calls)
    c.query_features("https://h/arcgis/rest/services/x/MapServer/0", bbox=(-83, 29, -82, 30))
    assert len(s.calls) == n  # served from cache


def test_blocked_classification(tmp_path):
    class Waf(FakeSession):
        def get(self, url, params=None, timeout=None):
            return FakeResp(403, headers={"content-type": "text/html"},
                            text="<html><title>Azure WAF</title></html>")

    class Sandbox(FakeSession):
        def get(self, url, params=None, timeout=None):
            return FakeResp(403, headers={"x-deny-reason": "host_not_allowed"}, text="no")

    with pytest.raises(RemoteBlocked):
        Client(tmp_path, "ua", 1000, session=Waf()).layer_info("https://a/x")
    with pytest.raises(SandboxBlocked):
        Client(tmp_path / "b", "ua", 1000, session=Sandbox()).layer_info("https://b/x")


def test_retries_on_5xx(tmp_path, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)

    class Flaky(FakeSession):
        n = 0

        def get(self, url, params=None, timeout=None):
            Flaky.n += 1
            return FakeResp(503, text="busy") if Flaky.n < 3 else FakeResp(body={"ok": 1})

    assert Client(tmp_path, "ua", 1000, session=Flaky()).layer_info("https://a/x") == {"ok": 1}
