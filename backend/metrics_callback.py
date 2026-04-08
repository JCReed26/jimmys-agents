"""
Stub — LangSmith now auto-instruments via LANGSMITH_TRACING env var.
MetricsCallback is a no-op kept for import compatibility with older agents.
"""


class MetricsCallback:
    """No-op callback. LangSmith traces automatically when LANGSMITH_TRACING=true."""
    pass
