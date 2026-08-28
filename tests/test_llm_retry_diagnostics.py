from types import SimpleNamespace

from pageindex import utils


class ProbeError(Exception):
    status_code = 429
    response = SimpleNamespace(
        status_code=429,
        headers={"retry-after": "60", "x-request-id": "req-123"},
    )

    def __str__(self):
        return "secret response body and API key"


def test_retry_diagnostics_are_useful_and_do_not_log_sensitive_text(monkeypatch, capsys, caplog):
    prompt = "CONFIDENTIAL-PROMPT"
    monkeypatch.setattr(utils.litellm, "completion", lambda **_kwargs: (_ for _ in ()).throw(ProbeError()))
    monkeypatch.setattr(utils.time, "sleep", lambda _seconds: None)

    assert utils.llm_completion("openai/test-model", prompt) == ""

    output = capsys.readouterr().out
    assert "[GNAI-RETRY]" in output
    assert "attempt=1/10" in output
    assert "exception=ProbeError" in output
    assert "status=429" in output
    assert "retry_after=60" in output
    assert "request_id=req-123" in output
    assert "next_retry_seconds=1" in output
    assert "CONFIDENTIAL-PROMPT" not in output
    assert "secret response body" not in output
    assert "API key" not in output
    assert "CONFIDENTIAL-PROMPT" not in caplog.text
    assert "secret response body" not in caplog.text
    assert "API key" not in caplog.text


def test_retry_diagnostics_handle_exceptions_without_http_response():
    details = utils.safe_llm_error_details(TimeoutError("do not print me"))

    assert details == {
        "exception": "TimeoutError",
        "status": "unknown",
        "retry_after": "none",
        "request_id": "none",
    }
