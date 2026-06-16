"""
Smoke test for the swiftship Python SDK.

The goal is structural, not behavioural: confirm that the OpenAPI
Generator's `python` template emitted the public surface that the rest
of our docs and tutorials reference — in particular the `OrdersApi`
class and the `Configuration` class.

If you regenerated the SDK via `node scripts/build-sdks.mjs --only=python`
(or the full script) the imports below should resolve. We do NOT make a
real network call; the SDK defaults to a sandbox host and we do not want
CI to depend on its uptime.
"""
from __future__ import annotations

import importlib


def test_swiftship_version_is_a_string() -> None:
    pkg = importlib.import_module("swiftship")
    assert isinstance(pkg.__version__, str) and pkg.__version__, (
        f"swiftship.__version__ should be a non-empty string, got {pkg.__version__!r}"
    )


def test_orders_api_symbol_exists() -> None:
    """The OpenAPI Generator `python` template emits `api/orders_api.py`
    exposing a class named `OrdersApi`. Smoke-import it.
    """
    # The generated `swiftship.api.orders_api` module is the source of truth
    # for the symbol. The OpenAPI generator-cli puts it under swiftship/api/.
    try:
        orders_api_mod = importlib.import_module("swiftship.api.orders_api")
    except ImportError as exc:  # pragma: no cover
        raise AssertionError(
            "swiftship.api.orders_api was not generated. "
            "Did you run `node scripts/build-sdks.mjs --only=python`?"
        ) from exc
    assert hasattr(orders_api_mod, "OrdersApi"), (
        f"swiftship.api.orders_api is missing the OrdersApi symbol: {dir(orders_api_mod)}"
    )


def test_configuration_symbol_exists() -> None:
    """`Configuration` lives in the generated `swiftship.configuration` module."""
    try:
        configuration_mod = importlib.import_module("swiftship.configuration")
    except ImportError as exc:  # pragma: no cover
        raise AssertionError(
            "swiftship.configuration was not generated. "
            "Did you run `node scripts/build-sdks.mjs --only=python`?"
        ) from exc
    assert hasattr(configuration_mod, "Configuration"), (
        f"swiftship.configuration is missing the Configuration symbol: {dir(configuration_mod)}"
    )


def test_configuration_default_host_is_swiftship() -> None:
    """The default `Configuration.host` should point at the public SwiftShip
    domain (or localhost) — never at a placeholder or empty string.
    """
    from swiftship.configuration import Configuration  # type: ignore[import-not-found]

    cfg = Configuration()
    assert cfg.host, "Configuration.host should not be empty"
    assert "swiftship" in cfg.host or "localhost" in cfg.host, (
        f"Configuration.host looks wrong: {cfg.host!r}"
    )
