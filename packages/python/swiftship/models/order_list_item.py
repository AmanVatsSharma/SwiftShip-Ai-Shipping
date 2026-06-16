"""OrderListItem — one row in `FindOrdersResponse.orders`."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from swiftship.models.base_model import ModelNormal
from swiftship.models.order_status import OrderStatus


class OrderListItem(ModelNormal):
    openapi_types: dict = {
        "id": "int",
        "order_number": "str",
        "total": "float",
        "status": "OrderStatus",
        "created_at": "datetime",
        "user_id": "int",
        "carrier_id": "int",
    }
    attribute_map: dict = {
        "id": "id",
        "orderNumber": "order_number",
        "total": "total",
        "status": "status",
        "createdAt": "created_at",
        "userId": "user_id",
        "carrierId": "carrier_id",
    }

    def __init__(
        self,
        *,
        id: int,
        order_number: str,
        total: float,
        status: OrderStatus,
        created_at: datetime,
        user_id: int,
        carrier_id: Optional[int] = None,
    ) -> None:
        self.id = id
        self.order_number = order_number
        self.total = total
        self.status = status
        self.created_at = created_at
        self.user_id = user_id
        self.carrier_id = carrier_id
