from fastapi.testclient import TestClient

import page_index


def test_react_view_and_assets_are_served() -> None:
    client = TestClient(page_index.app)

    root = client.get("/")
    assert root.status_code == 200
    assert '<div id="root"></div>' in root.text
    assert root.headers["cache-control"] == "no-cache"

    asset = next((page_index.VIEW_DIR / "assets").iterdir())
    response = client.get(f"/assets/{asset.name}")
    assert response.status_code == 200
    assert response.content


def test_existing_files_api_contract_is_preserved() -> None:
    response = TestClient(page_index.app).get("/api/files")
    assert response.status_code == 200
    assert set(response.json()) == {"pairs", "model", "index_model", "api_key_set"}


def test_config_does_not_return_saved_key_and_blank_update_preserves_it(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(page_index, "_cfg", {
        "api_key": "<REDACTED>", "model": "anthropic/model-a", "index_model": "anthropic/model-b",
    })
    monkeypatch.setattr(page_index, "_model", "anthropic/model-a")
    monkeypatch.setattr(page_index, "_index_model", "anthropic/model-b")
    monkeypatch.setattr(page_index, "CONFIG_PATH", tmp_path / "config.json")
    monkeypatch.setattr(page_index, "setup_env", lambda *_args: None)
    client = TestClient(page_index.app)

    loaded = client.get("/api/config").json()
    assert loaded["api_key"] == ""
    assert loaded["api_key_set"] is True

    response = client.post("/api/config", json={
        "api_key": "", "model": "openai/model-c", "index_model": "openai/model-d",
    })
    assert response.status_code == 200
    saved = __import__("json").loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    assert saved["api_key"] == "<REDACTED>"


def test_document_indexes_live_directly_in_documents(tmp_path, monkeypatch) -> None:
    source = tmp_path / "report.pdf"
    index = tmp_path / "report_structure.json"
    source.write_bytes(b"pdf fixture")
    index.write_text('{"structure": []}', encoding="utf-8")
    monkeypatch.setattr(page_index, "DOCS_DIR", tmp_path)

    response = page_index.api_list_files()
    assert response["pairs"] == [{
        "json_name": "report_structure.json",
        "json_path": str(index),
        "src_name": "report.pdf",
        "src_path": str(source),
        "has_src": True,
    }]
    assert page_index.api_check_index(str(source)) == {
        "exists": True,
        "output_name": "report_structure.json",
    }


def test_model_verification_keeps_success_and_rate_limited_models(monkeypatch) -> None:
    monkeypatch.setattr(page_index, "_cfg", {"api_key": "<REDACTED>"})

    async def fake_probe(_client, _api_key, model_id):
        assert _api_key == "<REDACTED>"
        status = {"anthropic/model-a": 200, "openai/model-b": 429, "openai/model-c": 404}[model_id]
        return {
            "id": model_id,
            "available": status in {200, 429},
            "status": status,
            "error": None if status in {200, 429} else "模型不存在或 endpoint 不支援",
        }

    monkeypatch.setattr(page_index, "_probe_supported_model", fake_probe)
    response = TestClient(page_index.app).post("/api/models/verify", json={
        "api_key": "",
        "models": ["anthropic/model-a", "openai/model-b", "openai/model-c"],
    })

    assert response.status_code == 200
    payload = response.json()
    assert [model["id"] for model in payload["models"]] == ["anthropic/model-a", "openai/model-b"]
    assert payload["available"] == 2
    assert payload["unavailable"] == 1
    assert "api_key" not in payload


def test_model_verification_reports_an_invalid_key_without_fallback(monkeypatch) -> None:
    async def rejected_probe(_client, _api_key, model_id):
        return {"id": model_id, "available": False, "status": 401, "error": "API key 驗證失敗"}

    monkeypatch.setattr(page_index, "_probe_supported_model", rejected_probe)
    response = TestClient(page_index.app).post("/api/models/verify", json={
        "api_key": "<REDACTED>",
        "models": ["anthropic/model-a", "openai/model-b"],
    })

    assert response.status_code == 401
    assert response.json()["detail"].startswith("API key 驗證失敗")


def test_model_verification_stream_lists_candidates_and_reports_each_step(monkeypatch) -> None:
    monkeypatch.setattr(page_index, "_cfg", {"api_key": "<REDACTED>"})
    discovered = [
        {"id": "anthropic/model-a", "label": "Model A"},
        {"id": "openai/model-b", "label": "Model B"},
        {"id": "openai/model-c", "label": "Model C"},
    ]

    monkeypatch.setattr(
        page_index,
        "_discover_model_options",
        lambda _api_key: discovered,
        raising=False,
    )

    async def fake_probe(_client, _api_key, model_id):
        assert _api_key == "<REDACTED>"
        available = model_id != "openai/model-c"
        return {
            "id": model_id,
            "available": available,
            "status": 200 if available else 404,
            "error": None if available else "模型不存在或 endpoint 不支援",
        }

    monkeypatch.setattr(page_index, "_probe_supported_model", fake_probe)
    response = TestClient(page_index.app).post("/api/models/verify/stream", json={
        "api_key": "",
        "models": [],
    })

    assert response.status_code == 200
    events = [
        __import__("json").loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert events[0] == {"type": "candidates", "models": discovered}
    assert sorted(event["id"] for event in events if event["type"] == "checking") == [
        "anthropic/model-a", "openai/model-b", "openai/model-c",
    ]
    assert len([event for event in events if event["type"] == "result"]) == 3
    assert events[-1]["type"] == "done"
    assert events[-1]["result"]["available"] == 2
    assert events[-1]["result"]["unavailable"] == 1
