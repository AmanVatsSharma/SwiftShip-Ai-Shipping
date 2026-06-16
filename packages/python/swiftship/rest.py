"""REST client for the SwiftShip AI Python SDK."""
import json
import logging
import re
import ssl
from typing import Any, Dict, List, Optional, Tuple, Union
import urllib3

from urllib3.exceptions import (
    InsecureRequestWarning,
    MaxRetryError,
    SSLError,
)

from swiftship import exceptions


logger = logging.getLogger("swiftship")


class RESTClientObject:
    """REST client wrapper around urllib3.PoolManager."""

    def __init__(self, configuration) -> None:
        if configuration.verify_ssl is False:
            urllib3.disable_warnings(InsecureRequestWarning)

        # urllib3 PoolManager
        self.pool_manager = urllib3.PoolManager(
            num_pools=configuration.connection_pool_maxsize,
            cert_file=configuration.cert_file,
            key_file=configuration.key_file,
            ca_certs=configuration.ssl_ca_cert,
            ca_cert_data=configuration.ca_cert_data,
        )

    def request(
        self,
        method: str,
        url: str,
        query_params: Optional[List[Tuple[str, Any]]] = None,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[Any] = None,
        post_params: Optional[List[Tuple[str, Any]]] = None,
        _preload_content: bool = True,
        _request_timeout: Optional[Union[float, Tuple[float, float]]] = None,
    ) -> Any:
        """Perform an HTTP request and return the response."""
        method = method.upper()
        if method not in ("GET", "HEAD", "DELETE", "POST", "PUT", "PATCH", "OPTIONS"):
            raise exceptions.ApiValueError(
                f"HTTP method {method} is not supported."
            )

        if query_params and "?" in url:
            url = url + "&" + urllib3.request.urlencode(query_params)
        elif query_params:
            url = url + "?" + urllib3.request.urlencode(query_params)

        if headers is None:
            headers = {}
        if "Content-Type" not in headers and "Accept" not in headers:
            headers["Accept"] = "application/json"

        try:
            r = self.pool_manager.request(
                method,
                url,
                body=body,
                preload_content=_preload_content,
                timeout=_request_timeout,
                headers=headers,
            )
        except urllib3.exceptions.HTTPError as e:
            msg = "Connection refused or other connection error."
            raise exceptions.ApiException(status=0, reason=msg) from e

        if _preload_content:
            return self.__deserialize(r)
        return r

    @staticmethod
    def __deserialize(r) -> Any:
        """Best-effort deserialization."""
        if r.status == 204:
            return None
        try:
            data = r.data.decode("utf-8")
        except Exception:
            data = r.data
        try:
            return json.loads(data) if isinstance(data, str) else data
        except ValueError:
            return data
