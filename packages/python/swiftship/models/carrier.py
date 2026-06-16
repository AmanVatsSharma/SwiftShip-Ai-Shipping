"""Carrier — generated stub for the SwiftShip AI Python SDK.

Replaced wholesale by the OpenAPI Generator's `python` template on the
next `node scripts/build-sdks.mjs --only=python` run. The stub only
exists so the package imports cleanly without Java on the path.
"""
from swiftship.models.base_model import ModelNormal


class Carrier(ModelNormal):
    openapi_types = {}
    attribute_map = {}

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
