"""Pagination — cursor + page size returned with every list endpoint."""
from __future__ import annotations

from typing import Optional

from swiftship.models.base_model import ModelNormal


class Pagination(ModelNormal):
    openapi_types: dict = {
        "total": "int",
        "offset": "int",
        "limit": "int",
    }
    attribute_map: dict = {
        "total": "total",
        "offset": "offset",
        "limit": "limit",
    }

    def __init__(
        self,
        *,
        total: int,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> None:
        self.total = total
        self.offset = offset
        self.limit = limit
