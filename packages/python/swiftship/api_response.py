"""ApiResponse[T] wrapper for typed responses."""
from typing import Generic, Mapping, TypeVar

T = TypeVar("T")


class ApiResponse(Generic[T]):
    """Lightweight typed response wrapper used by the generated APIs."""

    def __init__(self, status_code: int, data: T, headers: Mapping[str, str]) -> None:
        self.status_code = status_code
        self.data = data
        self.headers = headers
