import os
import sys

os.environ.setdefault("AUTH_PROVIDER", "test")
os.environ.setdefault("APP_ENV", "test")

if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
