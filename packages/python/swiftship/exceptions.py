"""Exceptions for the SwiftShip AI Python SDK.

Generated for OpenAPI spec version 3.0.3.
"""


class OpenApiException(Exception):
    """The base exception class for all OpenAPIExceptions."""


class ApiTypeError(OpenApiException, TypeError):
    """Raised for type-mismatch errors from the SDK."""

    def __init__(self, msg, path_to_item=None, valid_classes=None,
                 key_type=None) -> None:
        self.path_to_item = path_to_item
        self.valid_classes = valid_classes
        self.key_type = key_type
        full_msg = msg
        if path_to_item:
            full_msg = f"{msg} at {path_to_item}"
        if key_type:
            full_msg = f"{full_msg} (key_type={key_type})"
        super().__init__(full_msg)


class ApiValueError(OpenApiException, ValueError):
    """Raised for invalid-value errors from the SDK."""


class ApiKeyError(OpenApiException, KeyError):
    """Raised for missing/required key errors from the SDK."""


class ApiAttributeError(OpenApiException, AttributeError):
    """Raised for attribute access errors from the SDK."""


class ApiException(OpenApiException):
    """Raised for non-2xx HTTP responses from the API."""

    def __init__(self, status=None, reason=None, http_resp=None) -> None:
        self.status = status
        self.reason = reason
        self.body = http_resp.data if http_resp else None
        self.headers = http_resp.headers if http_resp else None
        super().__init__(f"({status}) {reason}: {self.body}")


class BadRequestException(ApiException):
    """Raised for 400-class errors."""

    def __init__(self, status=None, reason=None, http_resp=None) -> None:
        super().__init__(status, reason, http_resp)


class UnauthorizedException(ApiException):
    """Raised for 401-class errors."""

    def __init__(self, status=None, reason=None, http_resp=None) -> None:
        super().__init__(status, reason, http_resp)


class ForbiddenException(ApiException):
    """Raised for 403-class errors."""

    def __init__(self, status=None, reason=None, http_resp=None) -> None:
        super().__init__(status, reason, http_resp)


class NotFoundException(ApiException):
    """Raised for 404-class errors."""

    def __init__(self, status=None, reason=None, http_resp=None) -> None:
        super().__init__(status, reason, http_resp)


class ServiceException(ApiException):
    """Raised for 5xx-class errors."""

    def __init__(self, status=None, reason=None, http_resp=None) -> None:
        super().__init__(status, reason, http_resp)
