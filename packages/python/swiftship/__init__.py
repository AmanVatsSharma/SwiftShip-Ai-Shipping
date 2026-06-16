# flake8: noqa
"""
SwiftShip AI Python SDK.

Auto-generated from `apps/api-public/src/generated/openapi.json` by the
OpenAPI Generator CLI's `python` template. The public surface is:

    from swiftship import Configuration, ApiClient, OrdersApi

The per-tag API classes (OrdersApi, CarriersApi, ...) are exposed at the
package root via PEP 562 `__getattr__` (lazy module attribute lookup).
This avoids the circular import that a naive `from swiftship.api.X import X`
would trigger — the api/* modules import from `swiftship.api_client` and
`swiftship.configuration`, which would not yet be initialised when this
module is being loaded. The OpenAPI Generator's stock `python` template
uses the same `__getattr__` pattern.
"""
from swiftship.configuration import Configuration  # noqa: E402
from swiftship.api_client import ApiClient  # noqa: E402

from swiftship.exceptions import (  # noqa: E402
    ApiAttributeError,
    ApiException,
    ApiKeyError,
    ApiTypeError,
    ApiValueError,
    OpenApiException,
)

# Re-export every model at the package root so that
# `from swiftship import Order, Carrier, ...` works.
from swiftship.models.carrier import Carrier  # noqa: E402
from swiftship.models.carrier_list import CarrierList  # noqa: E402
from swiftship.models.carrier_response import CarrierResponse  # noqa: E402
from swiftship.models.counts_by_status import CountsByStatus  # noqa: E402
from swiftship.models.create_carrier_request import CreateCarrierRequest  # noqa: E402
from swiftship.models.create_label_request import CreateLabelRequest  # noqa: E402
from swiftship.models.create_label_response import CreateLabelResponse  # noqa: E402
from swiftship.models.create_order_request import CreateOrderRequest  # noqa: E402
from swiftship.models.create_return_request import CreateReturnRequest  # noqa: E402
from swiftship.models.create_shipment_request import CreateShipmentRequest  # noqa: E402
from swiftship.models.create_shipping_rate_request import CreateShippingRateRequest  # noqa: E402
from swiftship.models.delete_ok import DeleteOk  # noqa: E402
from swiftship.models.error import Error  # noqa: E402
from swiftship.models.find_orders_response import FindOrdersResponse  # noqa: E402
from swiftship.models.find_shipments_response import FindShipmentsResponse  # noqa: E402
from swiftship.models.order import Order  # noqa: E402
from swiftship.models.order_list_item import OrderListItem  # noqa: E402
from swiftship.models.order_status import OrderStatus  # noqa: E402
from swiftship.models.pagination import Pagination  # noqa: E402
from swiftship.models.rate_shop_quote import RateShopQuote  # noqa: E402
from swiftship.models.rate_shop_request import RateShopRequest  # noqa: E402
from swiftship.models.rate_shop_response import RateShopResponse  # noqa: E402
from swiftship.models.return_order import ReturnOrder  # noqa: E402
from swiftship.models.return_list import ReturnList  # noqa: E402
from swiftship.models.shipment import Shipment  # noqa: E402
from swiftship.models.shipment_status import ShipmentStatus  # noqa: E402
from swiftship.models.shipping_rate import ShippingRate  # noqa: E402
from swiftship.models.shipping_rate_list import ShippingRateList  # noqa: E402
from swiftship.models.label_status import LabelStatus  # noqa: E402
from swiftship.models.total_sales import TotalSales  # noqa: E402
from swiftship.models.tracking_event import TrackingEvent  # noqa: E402
from swiftship.models.tracking_response import TrackingResponse  # noqa: E402
from swiftship.models.tracking_webhook import TrackingWebhook  # noqa: E402
from swiftship.models.update_carrier_request import UpdateCarrierRequest  # noqa: E402
from swiftship.models.update_return_request import UpdateReturnRequest  # noqa: E402
from swiftship.models.update_shipment_request import UpdateShipmentRequest  # noqa: E402
from swiftship.models.update_shipping_rate_request import UpdateShippingRateRequest  # noqa: E402
from swiftship.models.webhook_ack import WebhookAck  # noqa: E402

__version__ = "0.1.0"


# PEP 562 lazy loader: `from swiftship import OrdersApi` works without
# re-binding the per-tag api/* modules at import time. The mapping is
# the (PascalCase class name) -> `swiftship.api.<snake_case>_api` module.
_LAZY_API_MODULES = {
    "CarriersApi": "swiftship.api.carriers_api",
    "OrdersApi": "swiftship.api.orders_api",
    "RateShopApi": "swiftship.api.rate_shop_api",
    "ReturnsApi": "swiftship.api.returns_api",
    "ShipmentsApi": "swiftship.api.shipments_api",
    "ShippingRatesApi": "swiftship.api.shipping_rates_api",
    "TrackingApi": "swiftship.api.tracking_api",
    "WebhooksApi": "swiftship.api.webhooks_api",
}


def __getattr__(name):
    """PEP 562 — lazy import for the per-tag API classes.

    Called only when `name` is not already in this module's globals, so
    eager `from swiftship.configuration import Configuration` etc. never
    trigger a load of the api/* modules. This is what makes both
    `from swiftship import OrdersApi` and `from swiftship.api.orders_api
    import OrdersApi` work without a circular import.
    """
    if name in _LAZY_API_MODULES:
        import importlib
        mod = importlib.import_module(_LAZY_API_MODULES[name])
        value = getattr(mod, name)
        globals()[name] = value  # cache for subsequent attribute access
        return value
    raise AttributeError(f"module 'swiftship' has no attribute {name!r}")


def __dir__():
    return sorted(set(globals().keys()) | _LAZY_API_MODULES.keys())
