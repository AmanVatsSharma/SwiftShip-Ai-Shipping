"""OrderStatus enum."""
from __future__ import annotations

import enum


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    PROCESSING = "PROCESSING"
    PAID = "PAID"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"
    RTO = "RTO"
    LOST = "LOST"
    EXCEPTION = "EXCEPTION"
