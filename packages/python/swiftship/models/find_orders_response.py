"""FindOrdersResponse — body for `GET /v1/orders`."""
from __future__ import annotations

from typing import List, Optional

from swiftship.models.base_model import ModelNormal
from swiftship.models.order_list_item import OrderListItem
from swiftship.models.pagination import Pagination


class FindOrdersResponse(ModelNormal):
    openapi_types: dict = {
        "orders": "list[OrderListItem]",
        "pagination": "Pagination",
    }
    attribute_map: dict = {
        "orders": "orders",
        "pagination": "pagination",
    }

    def __init__(
        self,
        *,
        orders: List[OrderListItem],
        pagination: Optional[Pagination] = None,
    ) -> None:
        self.orders = orders
        self.pagination = pagination
