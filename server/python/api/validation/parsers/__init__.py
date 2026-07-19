"""DIFARYX Phase 1B-B Step D1 - Parser package.

Importing this package registers all available technique parsers. Phase 1B-B
Step D1 registers only the XRD parser; Steps D2/D3/D4 will register XPS, FTIR
and Raman parsers respectively.
"""

from __future__ import annotations

from ..parser_base import TechniqueParser
from .xrd_parser import XrdParser

__all__ = ["XrdParser", "TechniqueParser"]
