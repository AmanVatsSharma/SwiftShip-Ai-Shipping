"""CreateOrderRequest — body for `POST /v1/orders`."""
from __future__ import annotations

from typing import Optional

from swiftship.models.base_model import ModelNormal
from swiftship.models.order_status import OrderStatus


class CreateOrderRequest(ModelNormal):
    openapi_types: dict = {
        "order_number": "str",
        "total": "float",
        "user_id": "int",
        "status": "OrderStatus",
        "carrier_id": "int",
        "destination_pincode": "str",
        "package_weight_grams": "int",
    }
    attribute_map: dict = {
        "orderNumber": "order_number",
        "total": "total",
        "userId": "user_id",
        "status": "status",
        "carrierId": "carrier_id",
        "destinationPincode": "destination_pincode",
        "packageWeightGrams": "package_weight_grams",
    }

    def __init__(
        self,
        *,
        order_number: str,
        total: float,
        user_id: int,
        status: Optional[OrderStatus] = None,
        carrier_id: Optional[int] = None,
        destination_pincode: Optional[str] = None,
        package_weight_grams: Optional[int] = None,
    ) -> None:
        self.order_number = order_number
        self.total = total
        self.user_id = user_id
        self.status = status
        self.carrier_id = carrier_id
        self.destination_pincode = destination_pincode
        self.package_weight_grams = package_weight_grams
