# swiftship — official Python SDK

Auto-generated Python client for the [SwiftShip AI](https://swiftship.ai) public REST API.
This package is produced by the OpenAPI Generator CLI's `python` template at build
time — the source of truth is the OpenAPI 3.0 spec at
`apps/api-public/src/generated/openapi.json`. To regenerate:

```bash
node scripts/build-sdks.mjs --only=python
```

## Install

```bash
pip install swiftship
```

(When publishing to PyPI is wired up — see SS-027e — `pip install swiftship` will
work end-to-end. Until then install from a local wheel:

```bash
cd packages/python
python -m build
pip install dist/swiftship-0.1.0-py3-none-any.whl
```

)

## Usage

```python
import swiftship
from swiftship import Configuration, OrdersApi, ApiClient

# Auth: X-Swiftship-Api-Key, set as the api_key prefix on urllib3.
configuration = Configuration(
    host="https://api.swiftship.ai",
    api_key={"api_key": "sk_live_..."},
)

with ApiClient(configuration) as client:
    orders = OrdersApi(client)
    page = orders.find_orders(limit=25, offset=0)
    for o in page.orders:
        print(o.order_number, o.status, o.total)
```

## Build a wheel locally

```bash
cd packages/python
python -m build         # produces dist/swiftship-0.1.0-py3-none-any.whl
twine check dist/*      # validates long_description + metadata
```

## Smoke test

```bash
cd packages/python
pip install -e ".[test]"
pytest tests/test_smoke.py
```

## Layout

```
packages/python/
├── pyproject.toml        # PEP 621 metadata (this file is the "owned" one; the
│                         # generator will write its own pyproject.toml on
│                         # `npm run build-sdks`, but the build script restores
│                         # this version so the public surface is stable).
├── swiftship/            # generated Python package (api_client, api/, ...)
│                         #   api/orders_api.py  -> OrdersApi
│                         #   configuration.py   -> Configuration
│                         #   api_client.py      -> ApiClient
│                         #   rest.py            -> RESTClientObject
└── tests/
    └── test_smoke.py     # imports OrdersApi, Configuration, checks default host
```

## License

Proprietary. © SwiftShip AI.
