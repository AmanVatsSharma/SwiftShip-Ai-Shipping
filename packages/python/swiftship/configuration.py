"""
Configuration for the SwiftShip AI Python SDK.

Generated for OpenAPI spec version 3.0.3.
"""
import copy
import http.client as httplib
import logging
from logging import FileHandler
import multiprocessing
import sys
from typing import Any, ClassVar, Dict, List, Optional, Tuple, Union
import urllib3

from six import PY3

import swiftship


class Configuration:
    """Class for the SDK configuration.

    Defaults are aligned with the public SwiftShip API surface. Override
    `host` and `api_key` at instantiation time to point at a sandbox or
    a self-hosted deployment.
    """

    _default: ClassVar[Optional["Configuration"]] = None

    def __init__(
        self,
        host: str = "https://api.swiftship.ai",
        api_key: Optional[Dict[str, str]] = None,
        api_key_prefix: Optional[Dict[str, str]] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        access_token: Optional[str] = None,
        server_index: Optional[int] = None,
        server_variables: Optional[Dict[str, str]] = None,
        server_operation_index: Optional[Dict[int, int]] = None,
        server_operation_variables: Optional[Dict[int, Dict[str, str]]] = None,
        ssl_ca_cert: Optional[str] = None,
        verify_ssl: bool = True,
        retries: Optional[int] = None,
        http_timeout: Optional[Union[float, Tuple[float, float]]] = None,
        proxy: Optional[str] = None,
        proxy_headers: Optional[Dict[str, str]] = None,
        safe_chars_for_path_param: str = "",
    ) -> None:
        """Initialize a new Configuration.

        :param host: Base URL of the SwiftShip API.
        :param api_key: Dict of api-key header name -> value. The SDK
            reads `api_key['api_key']` and applies `api_key_prefix['api_key']`
            as a prefix.
        """
        self.host = host
        """Default Base url"""

        # Authentication Settings
        self.api_key = {"api_key": ""}
        if api_key:
            self.api_key = api_key
        """dict to store API key(s)"""

        self.api_key_prefix = {"api_key": "Bearer"}
        if api_key_prefix:
            self.api_key_prefix = api_key_prefix
        """dict to store API prefix (e.g. Bearer)"""

        self.refresh_api_key_hook = None
        """function hook to refresh API key if it's expired"""

        self.username = username
        """Username for HTTP basic authentication"""

        self.password = password
        """Password for HTTP basic authentication"""

        self.access_token = access_token
        """Access token for OAuth/Bearer authentication"""

        self.logger = {}
        """Logging Settings"""

        self.logger["package_logger"] = logging.getLogger("swiftship")
        self.logger["urllib3_logger"] = logging.getLogger("urllib3")
        self.logger_format = "%(asctime)s %(levelname)s %(message)s"
        """Log format"""

        self.logger_stream_handler = None
        """Log stream handler"""

        self.debug = False
        """Debug switch"""

        self.verify_ssl = verify_ssl
        """SSL/TLS verification"""

        self.ssl_ca_cert = ssl_ca_cert
        """Set this to customize the SSL/TLS certificate trusted by the SDK."""

        self.cert_file = None
        self.key_file = None
        self.assert_hostname = None

        self.connection_pool_maxsize = multiprocessing.cpu_count() * 5
        """urllib3 connection pool's maximum number of connections saved per pool."""

        self.timeout = http_timeout
        """HTTP timeout (seconds)"""

        self.proxy = proxy
        """Proxy URL"""

        self.proxy_headers = proxy_headers
        """Proxy headers"""

        self.retries = retries
        """Adding retries to override urllib3 default"""

        self.ca_cert_data = None
        """CA certificate data (PEM) for `verify_ssl` when no cert file is set."""

        self.safe_chars_for_path_param = safe_chars_for_path_param
        """Safe characters for path parameters."""

    @classmethod
    def get_default(cls) -> "Configuration":
        """Return the singleton default config (lazily initialized)."""
        if cls._default is None:
            cls._default = Configuration()
        return cls._default

    @property
    def logger_file(self) -> Optional[FileHandler]:
        """The logger file used to log to a file."""
        logger_file = self.logger.get("file_handler", None)
        return logger_file

    @logger_file.setter
    def logger_file(self, value: Optional[FileHandler]) -> None:
        """Set logger file."""
        self.logger["file_handler"] = value

    @property
    def debug(self) -> bool:
        """Debug status."""
        return self.__debug

    @debug.setter
    def debug(self, value: bool) -> None:
        """Debug status setter."""
        self.__debug = value
        if self.__debug:
            # turn on http client debug logging if requested
            self.logger["package_logger"].setLevel(logging.DEBUG)
            self.logger["urllib3_logger"].setLevel(logging.DEBUG)
            http_client_logger = logging.getLogger("http.client")
            if not any(
                isinstance(h, logging.StreamHandler)
                for h in http_client_logger.handlers
            ):
                http_client_logger.setLevel(logging.DEBUG)
                if self.logger_stream_handler is not None:
                    http_client_logger.addHandler(self.logger_stream_handler)
        else:
            # turn off http client debug logging
            self.logger["package_logger"].setLevel(logging.INFO)
            self.logger["urllib3_logger"].setLevel(logging.WARNING)
            http_client_logger = logging.getLogger("http.client")
            http_client_logger.setLevel(logging.WARNING)
            self.logger_stream_handler = None

    @classmethod
    def set_default(cls, default: Optional["Configuration"]) -> None:
        """Set default configuration (None to clear)."""
        cls._default = default

    def auth_settings(self) -> Dict[str, Dict[str, str]]:
        """Return auth settings dict for the API client."""
        auth: Dict[str, Dict[str, str]] = {}
        if self.api_key.get("api_key"):
            prefix = self.api_key_prefix.get("api_key", "")
            if prefix:
                auth["api_key"] = {
                    "in": "header",
                    "key": "X-Swiftship-Api-Key",
                    "value": prefix + " " + self.api_key["api_key"],
                }
            else:
                auth["api_key"] = {
                    "in": "header",
                    "key": "X-Swiftship-Api-Key",
                    "value": self.api_key["api_key"],
                }
        return auth

    def to_debug_report(self) -> str:
        """Return a debug report of the configuration."""
        return (
            f"Python SDK Debug Report:\n"
            f"OS: {sys.platform}\n"
            f"Python Version: {sys.version}\n"
            f"Version of the API: 1.0.0\n"
            f"SDK Package Version: {swiftship.__version__}\n"
        )
