"""
OrdersApi — operations on `/v1/orders`.

Auto-generated from the SwiftShip OpenAPI 3.0 spec. Every method maps
1:1 to a tsoa endpoint in `apps/api-public/src/controllers/orders.controller.ts`.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union

from swiftship.api_client import ApiClient
from swiftship.configuration import Configuration
from swiftship.models.create_order_request import CreateOrderRequest
from swiftship.models.counts_by_status import CountsByStatus
from swiftship.models.delete_ok import DeleteOk
from swiftship.models.find_orders_response import FindOrdersResponse
from swiftship.models.order import Order
from swiftship.models.total_sales import TotalSales


class OrdersApi:
    """API endpoint group for the `Orders` tag.

    All HTTP calls are routed through `self.api_client`; the caller is
    expected to inject one (typically via `with ApiClient(cfg) as c: ...`).
    """

    def __init__(self, api_client: Optional[ApiClient] = None) -> None:
        if api_client is None:
            api_client = ApiClient.get_default()  # type: ignore[attr-defined]
        self.api_client = api_client

    # ------------------------------------------------------------------
    # GET /v1/orders
    # ------------------------------------------------------------------
    def find_orders(
        self,
        *,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
        order_number: Optional[str] = None,
        status: Optional[str] = None,
        user_id: Optional[int] = None,
        min_created_at: Optional[str] = None,
        max_created_at: Optional[str] = None,
    ) -> FindOrdersResponse:
        """List orders for the current tenant."""
        query_params: List[Tuple[str, Any]] = []
        if offset is not None:
            query_params.append(("offset", offset))
        if limit is not None:
            query_params.append(("limit", limit))
        if order_number is not None:
            query_params.append(("orderNumber", order_number))
        if status is not None:
            query_params.append(("status", status))
        if user_id is not None:
            query_params.append(("userId", user_id))
        if min_created_at is not None:
            query_params.append(("minCreatedAt", min_created_at))
        if max_created_at is not None:
            query_params.append(("maxCreatedAt", max_created_at))

        return self.api_client.call_api(
            "/v1/orders",
            "GET",
            query_params=query_params,
            response_type=(FindOrdersResponse,),
            auth_settings=["api_key"],
        )

    # ------------------------------------------------------------------
    # POST /v1/orders
    # ------------------------------------------------------------------
    def create_order(self, body: CreateOrderRequest) -> Order:
        """Create a new order."""
        return self.api_client.call_api(
            "/v1/orders",
            "POST",
            body=body,
            response_type=(Order,),
            auth_settings=["api_key"],
        )

    # ------------------------------------------------------------------
    # GET /v1/orders/{id}
    # ------------------------------------------------------------------
    def find_order_by_id(self, id: int) -> Order:
        """Get a single order by id."""
        path_params: Dict[str, Any] = {"id": id}
        return self.api_client.call_api(
            "/v1/orders/{id}",
            "GET",
            path_params=path_params,
            response_type=(Order,),
            auth_settings=["api_key"],
        )

    # ------------------------------------------------------------------
    # PATCH /v1/orders/{id}
    # ------------------------------------------------------------------
    def update_order(self, id: int, body: CreateOrderRequest) -> Order:
        """Update an order by id."""
        path_params: Dict[str, Any] = {"id": id}
        return self.api_client.call_api(
            "/v1/orders/{id}",
            "PATCH",
            path_params=path_params,
            body=body,
            response_type=(Order,),
            auth_settings=["api_key"],
        )

    # ------------------------------------------------------------------
    # DELETE /v1/orders/{id}
    # ------------------------------------------------------------------
    def delete_order(self, id: int) -> DeleteOk:
        """Delete an order by id."""
        path_params: Dict[str, Any] = {"id": id}
        return self.api_client.call_api(
            "/v1/orders/{id}",
            "DELETE",
            path_params=path_params,
            response_type=(DeleteOk,),
            auth_settings=["api_key"],
        )

    # ------------------------------------------------------------------
    # GET /v1/orders/total-sales
    # ------------------------------------------------------------------
    def total_sales(self) -> TotalSales:
        """Total sales across all PAID orders."""
        return self.api_client.call_api(
            "/v1/orders/total-sales",
            "GET",
            response_type=(TotalSales,),
            auth_settings=["api_key"],
        )

    # ------------------------------------------------------------------
    # GET /v1/orders/counts-by-status
    # ------------------------------------------------------------------
    def counts_by_status(self) -> CountsByStatus:
        """Count of orders grouped by status."""
        return self.api_client.call_api(
            "/v1/orders/counts-by-status",
            "GET",
            response_type=(CountsByStatus,),
            auth_settings=["api_key"],
        )
