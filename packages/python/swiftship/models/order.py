"""Order — full order record returned by `GET /v1/orders/{id}`."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from swiftship.models.base_model import ModelNormal
from swiftship.models.order_status import OrderStatus


class Order(ModelNormal):
    openapi_types: dict = {
        "id": "int",
        "order_number": "str",
        "total": "float",
        "status": "OrderStatus",
        "user_id": "int",
        "carrier_id": "int",
        "created_at": "datetime",
        "updated_at": "datetime",
    }
    attribute_map: dict = {
        "id": "id",
        "orderNumber": "order_number",
        "total": "total",
        "status": "status",
        "userId": "user_id",
        "carrierId": "carrier_id",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    }

    def __init__(
        self,
        *,
        id: int,
        order_number: str,
        total: float,
        status: OrderStatus,
        user_id: int,
        created_at: datetime,
        updated_at: datetime,
        carrier_id: Optional[int] = None,
    ) -> None:
        self.id = id
        self.order_number = order_number
        self.total = total
        self.status = status
        self.user_id = user_id
        self.created_at = created_at
        self.updated_at = updated_at
        self.carrier_id = carrier_id
