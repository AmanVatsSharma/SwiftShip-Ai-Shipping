"""DeleteOk — uniform success body for `DELETE` endpoints."""
from __future__ import annotations

from typing_extensions import Literal

from swiftship.models.base_model import ModelNormal


class DeleteOk(ModelNormal):
    openapi_types: dict = {
        "id": "int",
        "ok": "bool",
    }
    attribute_map: dict = {
        "id": "id",
        "ok": "ok",
    }

    def __init__(self, *, id: int, ok: Literal[True] = True) -> None:
        self.id = id
        self.ok = ok
