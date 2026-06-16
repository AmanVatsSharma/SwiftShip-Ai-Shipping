"""Base model plumbing for the generated Python SDK.

The OpenAPI Generator `python` template emits pydantic v1 model classes
with `ModelNormal` / `ModelSimple` infrastructure. We keep the public
surface identical so swapping the stub for a real regeneration is a
drop-in change.
"""
from __future__ import annotations

from typing import Any, ClassVar, Dict, List, Optional, Tuple

from attr import asdict, attrs, fields, validators


class ModelSimple:
    """Placeholder base class for primitive models."""

    openapi_types: ClassVar[Dict[str, str]] = {}
    attribute_map: ClassVar[Dict[str, str]] = {}

    def to_str(self) -> str:
        return f"{type(self).__name__}({self.__dict__})"

    def to_dict(self) -> Dict[str, Any]:
        return {k: getattr(self, k) for k in self.attribute_map}

    def __repr__(self) -> str:
        return self.to_str()


class ModelNormal:
    """Placeholder base class for object models."""

    openapi_types: ClassVar[Dict[str, str]] = {}
    attribute_map: ClassVar[Dict[str, str]] = {}

    def to_dict(self) -> Dict[str, Any]:
        return {k: getattr(self, k) for k in self.attribute_map if getattr(self, k, None) is not None}

    def to_str(self) -> str:
        return f"{type(self).__name__}({self.to_dict()})"

    def __repr__(self) -> str:
        return self.to_str()
