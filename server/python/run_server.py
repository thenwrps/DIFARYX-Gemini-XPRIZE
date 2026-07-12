#!/usr/bin/env python3
"""
DIFARYX XRD Processing Engine — Server Entrypoint.

Convenience script to launch the FastAPI gateway with uvicorn.

Usage:
    python run_server.py                      # default: 0.0.0.0:8000
    python run_server.py --port 3001          # custom port
    python run_server.py --host 127.0.0.1     # localhost only

Environment variables:
    XRD_HOST    — Bind address (default 0.0.0.0)
    XRD_PORT    — Bind port    (default 8000)
    XRD_RELOAD  — Auto-reload  (default true in dev)
"""

import argparse
import logging
import os
import sys

# Ensure the server/python directory is on the Python path
# so that `from api.gateway import app` resolves correctly.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import uvicorn  # noqa: E402


def main() -> None:
    """Parse CLI arguments and launch the uvicorn server."""
    import sys
    import asyncio
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    parser = argparse.ArgumentParser(
        description="DIFARYX XRD Processing Engine — FastAPI Gateway",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=os.environ.get("XRD_HOST", "0.0.0.0"),
        help="Bind address (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("XRD_PORT", "8000")),
        help="Bind port (default: 8000)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=os.environ.get("XRD_RELOAD", "true").lower() in ("true", "1", "yes"),
        help="Enable auto-reload on code changes (default: true)",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        default=False,
        help="Disable auto-reload.",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
        help="Uvicorn log level (default: info)",
    )

    args = parser.parse_args()

    reload = args.reload and not args.no_reload

    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
    )

    logger = logging.getLogger("difaryx.xrd.server")
    logger.info(
        "Starting DIFARYX XRD Gateway on %s:%d (reload=%s, log_level=%s)",
        args.host,
        args.port,
        reload,
        args.log_level,
    )

    uvicorn.run(
        "api.gateway:app",
        host=args.host,
        port=args.port,
        reload=reload,
        log_level=args.log_level,
        access_log=True,
    )


if __name__ == "__main__":
    main()