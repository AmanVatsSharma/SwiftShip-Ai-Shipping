"""
API client for the SwiftShip AI Python SDK.

Generated for OpenAPI spec version 3.0.3.
"""
import json
import logging
import mimetypes
import re
import sys
from typing import Any, Dict, Generic, List, Mapping, Optional, Tuple, Type, TypeVar, Union
from urllib.parse import quote

import urllib3

from swiftship.configuration import Configuration
from swiftship.exceptions import (
    ApiAttributeError,
    ApiException,
    ApiKeyError,
    ApiTypeError,
    ApiValueError,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    ServiceException,
    UnauthorizedException,
)
from swiftship.rest import RESTClientObject
from swiftship.api_response import ApiResponse, T


logger = logging.getLogger("swiftship")


class ApiClient:
    """Generic API client for OpenAPI client libraries."""

    PRIMITIVE_TYPES = (float, bool, bytes, str, int)
    NATIVE_TYPES_MAPPING = {
        "int": int,
        "long": int,
        "float": float,
        "double": float,
        "bool": bool,
        "boolean": bool,
        "str": str,
        "string": str,
        "date": str,
        "datetime": str,
        "object": object,
    }
    _pool: Optional[urllib3.PoolManager] = None

    def __init__(
        self,
        configuration: Optional[Configuration] = None,
        header_name: Optional[str] = None,
        header_value: Optional[str] = None,
        cookie: Optional[str] = None,
        pool_threads: int = 1,
    ) -> None:
        if configuration is None:
            configuration = Configuration.get_default()
        self.configuration = configuration
        self.rest_client = RESTClientObject(configuration)
        self.default_headers: Dict[str, str] = {}
        if header_name is not None:
            self.default_headers[header_name] = header_value
        self.cookie = cookie
        self.pool_threads = pool_threads
        self.__set_user_agent()

    def __enter__(self) -> "ApiClient":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.close()

    def close(self) -> None:
        self.rest_client.close()

    def __set_user_agent(self) -> None:
        user_agent = f"OpenAPI-Generator/1.0.0/python"
        self.default_headers["User-Agent"] = user_agent

    @property
    def user_agent(self) -> str:
        return self.default_headers["User-Agent"]

    @user_agent.setter
    def user_agent(self, value: str) -> None:
        self.default_headers["User-Agent"] = value

    def set_default_header(self, header_name: str, header_value: str) -> None:
        self.default_headers[header_name] = header_value

    def __call_api(
        self,
        resource_path: str,
        method: str,
        path_params: Optional[Dict[str, Any]] = None,
        query_params: Optional[List[Tuple[str, Any]]] = None,
        header_params: Optional[Dict[str, Any]] = None,
        body: Optional[Any] = None,
        post_params: Optional[List[Tuple[str, Any]]] = None,
        files: Optional[Dict[str, str]] = None,
        response_type: Optional[Tuple[Type[Any], Type[Any]]] = None,
        auth_settings: Optional[List[str]] = None,
        _return_http_data_only: bool = False,
        collection_formats: Optional[Dict[str, str]] = None,
        _preload_content: bool = True,
        _request_timeout: Optional[Union[float, Tuple[float, float]]] = None,
    ) -> Any:
        config = self.configuration

        # header parameters
        header_params = header_params or {}
        header_params.update(self.default_headers)
        if self.cookie:
            header_params["Cookie"] = self.cookie

        # auth setting
        auth_settings = auth_settings or []
        if auth_settings:
            if not config.api_key and not config.access_token:
                raise ApiKeyError(
                    "No authentication setting was supplied when invoking the API."
                )
            for auth in auth_settings:
                if auth == "api_key":
                    key = config.api_key.get("api_key")
                    prefix = config.api_key_prefix.get("api_key", "")
                    if key:
                        header_params["X-Swiftship-Api-Key"] = (
                            f"{prefix} {key}" if prefix else key
                        )

        # path parameters
        if path_params:
            for k, v in path_params.items():
                if v is None:
                    continue
                resource_path = resource_path.replace(
                    "{" + k + "}", quote(str(v), safe=config.safe_chars_for_path_param)
                )

        # query parameters
        if query_params:
            query_params = self._normalize_query_params(query_params, collection_formats)

        # post parameters / body
        if post_params or files:
            post_params = self._normalize_post_params(post_params, collection_formats)
            if body is not None:
                raise ApiValueError(
                    "body parameter cannot be used with post_params/files."
                )

        # header for content type
        content_type = (
            body and isinstance(body, (str, bytes)) and "application/json"
        )
        if content_type is None and post_params:
            content_type = "application/x-www-form-urlencoded"

        # url
        url = self.configuration.host + resource_path

        # perform request and return response
        response_data = self.rest_client.request(
            method,
            url,
            query_params=query_params,
            headers=header_params,
            body=body,
            post_params=post_params,
            _preload_content=_preload_content,
            _request_timeout=_request_timeout,
        )

        return response_data

    @staticmethod
    def _normalize_query_params(
        query_params: List[Tuple[str, Any]],
        collection_formats: Optional[Dict[str, str]] = None,
    ) -> List[Tuple[str, Any]]:
        out: List[Tuple[str, Any]] = []
        for k, v in query_params:
            if v is None:
                continue
            out.append((k, v))
        return out

    @staticmethod
    def _normalize_post_params(
        post_params: List[Tuple[str, Any]],
        collection_formats: Optional[Dict[str, str]] = None,
    ) -> List[Tuple[str, Any]]:
        out: List[Tuple[str, Any]] = []
        for k, v in post_params:
            if v is None:
                continue
            out.append((k, v))
        return out
