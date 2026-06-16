"""CountsByStatus — body for `GET /v1/orders/counts-by-status`."""
from __future__ import annotations

from typing import Dict

from swiftship.models.base_model import ModelNormal


class CountsByStatus(ModelNormal):
    openapi_types: dict = {
        "counts": "dict(str, int)",
    }
    attribute_map: dict = {
        "counts": "counts",
    }

    def __init__(self, *, counts: Dict[str, int]) -> None:
        self.counts = counts
