"""ShipmentsApi — generated stub for the SwiftShip AI Python SDK.

Replaced wholesale by the OpenAPI Generator's `python` template on the
next `node scripts/build-sdks.mjs --only=python` run.
"""
from typing import Optional

from swiftship.api_client import ApiClient


class ShipmentsApi:
    def __init__(self, api_client: Optional[ApiClient] = None) -> None:
        self.api_client = api_client
