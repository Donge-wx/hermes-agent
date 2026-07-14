from __future__ import annotations

import pytest

from hermes_cli.managed_model_policy import (
    MANAGED_DEFAULT_MODEL,
    MANAGED_MODEL_IDS,
    ManagedModelPolicyError,
    assert_managed_model_allowed,
    filter_managed_model_rows,
    get_managed_model_policy,
)


def _rows() -> list[dict]:
    return [
        {
            "slug": "openai-codex",
            "name": "OpenAI Codex",
            "is_current": True,
            "models": ["gpt-5.6-sol", "gpt-5.6-terra-pro"],
            "total_models": 2,
            "pricing": {"gpt-5.6-sol": {"input": 1}, "gpt-5.6-terra-pro": {"input": 2}},
            "capabilities": {"gpt-5.6-sol": {"reasoning": True}, "gpt-5.6-terra-pro": {"reasoning": True}},
            "unavailable_models": ["gpt-5.6-terra-pro"],
        },
        {
            "slug": "openrouter",
            "name": "OpenRouter",
            "is_current": False,
            "models": ["openai/gpt-5.6-terra"],
            "total_models": 1,
        },
    ]


def test_unmanaged_runtime_keeps_picker_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HERMES_MANAGED_EMPLOYEE", raising=False)

    assert filter_managed_model_rows(_rows(), current_provider="openai-codex") == _rows()
    assert_managed_model_allowed("openrouter", "openai/gpt-5.6-terra")


def test_managed_runtime_exposes_exact_switchable_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")

    rows = filter_managed_model_rows(_rows(), current_provider="openai-codex")

    assert len(rows) == 1
    assert rows[0]["slug"] == "openai-codex"
    assert rows[0]["models"] == list(MANAGED_MODEL_IDS)
    assert rows[0]["total_models"] == len(MANAGED_MODEL_IDS)
    assert rows[0]["is_current"] is True
    assert rows[0]["pricing"] == {"gpt-5.6-sol": {"input": 1}}
    assert rows[0]["capabilities"] == {"gpt-5.6-sol": {"reasoning": True}}
    assert rows[0]["unavailable_models"] == []
    assert MANAGED_DEFAULT_MODEL == "gpt-5.6-terra"


def test_managed_runtime_rejects_models_outside_the_allowlist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "true")

    assert_managed_model_allowed("openai-codex", "gpt-5.6-terra")
    with pytest.raises(ManagedModelPolicyError):
        assert_managed_model_allowed("OPENAI-CODEX", "gpt-5.6-terra")
    with pytest.raises(ManagedModelPolicyError, match="gpt-5.6-sol"):
        assert_managed_model_allowed("openai-codex", "gpt-5.6-terra-pro")
    with pytest.raises(ManagedModelPolicyError):
        assert_managed_model_allowed("openrouter", "openai/gpt-5.6-terra")


def test_protected_managed_scope_can_extend_the_model_policy(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    managed = tmp_path / "managed"
    managed.mkdir()
    (managed / "config.yaml").write_text(
        "model:\n  provider: openai-codex\n  default: gpt-5.7-nova\n  allowed_models:\n  - gpt-5.6-terra\n  - gpt-5.7-nova\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_MANAGED_DIR", str(managed))

    rows = filter_managed_model_rows(_rows(), current_provider="openai-codex")
    policy = get_managed_model_policy()
    from hermes_cli import managed_scope

    effective = managed_scope.apply_managed_overlay(
        {
            "model": {
                "provider": "openrouter",
                "default": "openai/gpt-5.6-terra-pro",
                "allowed_models": ["openai/gpt-5.6-terra-pro"],
            }
        }
    )

    assert rows[0]["models"] == ["gpt-5.6-terra", "gpt-5.7-nova"]
    assert policy is not None
    assert policy.default_model == "gpt-5.7-nova"
    assert effective["model"] == {
        "provider": "openai-codex",
        "default": "gpt-5.7-nova",
        "allowed_models": ["gpt-5.6-terra", "gpt-5.7-nova"],
    }
    assert_managed_model_allowed("openai-codex", "gpt-5.7-nova")
    with pytest.raises(ManagedModelPolicyError):
        assert_managed_model_allowed("openai-codex", "gpt-5.6-sol")


def test_invalid_protected_policy_fails_closed(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    managed = tmp_path / "managed"
    managed.mkdir()
    (managed / "config.yaml").write_text(
        "model:\n  provider: openai-codex\n  default: gpt-5.6-terra\n  allowed_models: []\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")
    monkeypatch.setenv("HERMES_MANAGED_DIR", str(managed))

    assert filter_managed_model_rows(_rows()) == []
    with pytest.raises(ManagedModelPolicyError, match="策略无效"):
        assert_managed_model_allowed("openai-codex", "gpt-5.6-terra")


def test_managed_http_model_write_is_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException
    from hermes_cli.web_server import _apply_model_assignment_sync

    monkeypatch.setenv("HERMES_MANAGED_EMPLOYEE", "1")

    with pytest.raises(HTTPException) as exc_info:
        _apply_model_assignment_sync(
            "auxiliary", "openrouter", "", "", "", api_key=""
        )

    assert exc_info.value.status_code == 403
