"""Immutable model guard for managed employee Hermes runtimes.

Employee homes are writable by their own Windows accounts, so an employee
gateway must not derive its selectable model set from ``config.yaml`` or a
live provider catalog.  The policy lives in the administrator-controlled
runtime and is shared by every model entry point.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import re
from typing import Iterable, Mapping


MANAGED_EMPLOYEE_ENV = "HERMES_MANAGED_EMPLOYEE"
MANAGED_PROVIDER = "openai-codex"
MANAGED_MODEL_IDS = (
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
)
MANAGED_DEFAULT_MODEL = "gpt-5.6-terra"
_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
_MODEL_TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")
_PROVIDER_TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class ManagedModelPolicyError(ValueError):
    """Raised when a managed employee selects a disallowed model."""


def is_managed_employee(environ: Mapping[str, str] | None = None) -> bool:
    """Whether the process has the employee-managed launch marker."""

    source = os.environ if environ is None else environ
    value = str(source.get(MANAGED_EMPLOYEE_ENV, "") or "").strip().casefold()
    return value in _TRUE_VALUES


@dataclass(frozen=True)
class ManagedModelPolicy:
    """The fixed model set available in an employee-managed runtime."""

    provider: str = MANAGED_PROVIDER
    allowed_models: tuple[str, ...] = MANAGED_MODEL_IDS
    default_model: str = MANAGED_DEFAULT_MODEL

    @property
    def is_valid(self) -> bool:
        return bool(
            _PROVIDER_TOKEN_RE.fullmatch(self.provider)
            and self.allowed_models
            and self.default_model in self.allowed_models
        )

    def allows(self, provider: str, model: str) -> bool:
        return provider == self.provider and model in self.allowed_models

    @property
    def rejection_message(self) -> str:
        if not self.is_valid:
            return "万域数动员工版的模型策略无效，请联系管理员。"
        choices = "、".join(self.allowed_models)
        return f"万域数动员工版仅允许使用以下模型：{choices}。"


def get_managed_model_policy(
    environ: Mapping[str, str] | None = None,
) -> ManagedModelPolicy | None:
    """Return a managed policy only in an employee-managed process.

    The built-in three-model policy is the secure compatibility default.  A
    protected ``HERMES_MANAGED_DIR/config.yaml`` may explicitly replace it,
    allowing administrators to add an approved model without trusting the
    writable employee home.  A present but malformed protected policy fails
    closed rather than silently falling back to a broader catalog.
    """

    if not is_managed_employee(environ):
        return None

    # An injected mapping is used by unit tests and deliberately does not
    # inspect process-global managed scope.  Production uses os.environ below.
    if environ is not None:
        return ManagedModelPolicy()

    try:
        from hermes_cli import managed_scope

        managed_dir = managed_scope.get_managed_dir()
        config_path = (managed_dir / "config.yaml") if managed_dir else None
        if config_path is None or not config_path.is_file():
            return ManagedModelPolicy()
        config = managed_scope.load_managed_config()
        model = config.get("model") if isinstance(config, dict) else None
        if not isinstance(model, dict):
            return ManagedModelPolicy(provider="", allowed_models=())
        provider = model.get("provider")
        allowed = model.get("allowed_models")
        if not isinstance(provider, str) or not _PROVIDER_TOKEN_RE.fullmatch(provider):
            return ManagedModelPolicy(provider="", allowed_models=())
        default = model.get("default")
        if not isinstance(allowed, list) or not allowed:
            return ManagedModelPolicy(provider="", allowed_models=())
        if not isinstance(default, str):
            return ManagedModelPolicy(provider="", allowed_models=())
        if not all(isinstance(item, str) and _MODEL_TOKEN_RE.fullmatch(item) for item in allowed):
            return ManagedModelPolicy(provider="", allowed_models=())
        if len({item.casefold() for item in allowed}) != len(allowed):
            return ManagedModelPolicy(provider="", allowed_models=())
        if default not in allowed:
            return ManagedModelPolicy(provider="", allowed_models=())
        return ManagedModelPolicy(
            provider=provider,
            allowed_models=tuple(allowed),
            default_model=default,
        )
    except Exception:
        # A managed policy that cannot be read must never widen employee
        # entitlements.  This empty policy makes every selection fail closed.
        return ManagedModelPolicy(provider="", allowed_models=(), default_model="")


def assert_managed_model_allowed(provider: str, model: str) -> None:
    """Reject selections outside the employee policy without affecting admins."""

    policy = get_managed_model_policy()
    if policy is not None and not policy.allows(provider, model):
        raise ManagedModelPolicyError(policy.rejection_message)


def filter_managed_model_rows(
    rows: Iterable[Mapping[str, object]],
    *,
    current_provider: str = "",
) -> list[dict]:
    """Return the approved picker row for a managed employee.

    The fixed policy supplies canonical IDs instead of trusting a stale live
    inventory.  Metadata for models outside that policy is removed too, so the
    gateway response cannot advertise a model that its switch API will reject.
    """

    copied = [dict(row) for row in rows]
    policy = get_managed_model_policy()
    if policy is None:
        return copied

    provider_key = policy.provider.casefold()
    selected = next(
        (
            row
            for row in copied
            if str(row.get("slug", "") or "").strip().casefold() == provider_key
        ),
        None,
    )
    if selected is None:
        return []

    allowed = set(policy.allowed_models)
    selected["slug"] = policy.provider
    selected["models"] = list(policy.allowed_models)
    selected["total_models"] = len(policy.allowed_models)
    selected["is_current"] = (
        str(current_provider or "").strip().casefold() == provider_key
    )
    for key in ("pricing", "capabilities"):
        metadata = selected.get(key)
        if isinstance(metadata, Mapping):
            selected[key] = {
                model: value for model, value in metadata.items() if model in allowed
            }
    unavailable = selected.get("unavailable_models")
    if isinstance(unavailable, list):
        selected["unavailable_models"] = [model for model in unavailable if model in allowed]
    return [selected]
