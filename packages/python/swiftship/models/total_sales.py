"""TotalSales — body for `GET /v1/orders/total-sales`."""
from __future__ import annotations

from swiftship.models.base_model import ModelNormal


class TotalSales(ModelNormal):
    openapi_types: dict = {
        "total": "float",
    }
    attribute_map: dict = {
        "total": "total",
    }

    def __init__(self, *, total: float) -> None:
        self.total = total
