import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

# Enable asyncio mode for all async tests
def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: mark test as async")
