"""
Agent registry — loads agents.yaml and tracks per-agent circuit breaker state.

Circuit breaker logic:
  - 3 consecutive failures → OPEN for RECOVERY_SECS seconds
  - First success after recovery window → CLOSED, counter reset
  - Gateway returns 503 immediately when circuit is OPEN
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

CONFIG_PATH = Path(__file__).parent.parent / "agents.yaml"

FAILURE_THRESHOLD = 3      # failures before opening circuit
RECOVERY_SECS = 60         # seconds to wait before allowing retry


@dataclass
class AgentConfig:
    name: str
    port: int
    dir: str
    enabled: bool = True
    rate_limit: str = "20/minute"


@dataclass
class _CircuitState:
    failures: int = 0
    opened_at: Optional[float] = None  # epoch seconds when circuit opened


class AgentRegistry:
    def __init__(self, config_path: Path = CONFIG_PATH):
        self._config_path = config_path
        self._agents: dict[str, AgentConfig] = {}
        self._circuits: dict[str, _CircuitState] = {}
        self.load()

    # ── Loading ──────────────────────────────────────────────────────────

    def load(self) -> None:
        """Read agents.yaml and rebuild the registry. Thread-safe (GIL-protected dict swap)."""
        raw = yaml.safe_load(self._config_path.read_text()) or {}
        agents: dict[str, AgentConfig] = {}
        for name, cfg in (raw.get("agents") or {}).items():
            agents[name] = AgentConfig(
                name=name,
                port=int(cfg["port"]),
                dir=cfg.get("dir", name),
                enabled=bool(cfg.get("enabled", True)),
                rate_limit=cfg.get("rate_limit", "20/minute"),
            )
        self._agents = agents
        # Preserve existing circuit state across reloads
        for name in agents:
            if name not in self._circuits:
                self._circuits[name] = _CircuitState()

    def reload(self) -> None:
        """Hot-reload from disk — called by POST /registry/reload."""
        self.load()

    # ── Lookup ───────────────────────────────────────────────────────────

    def get(self, name: str) -> Optional[AgentConfig]:
        return self._agents.get(name)

    def get_all(self) -> list[AgentConfig]:
        return list(self._agents.values())

    def is_registered(self, name: str) -> bool:
        return name in self._agents

    def base_url(self, name: str) -> str:
        agent = self._agents[name]
        return f"http://localhost:{agent.port}"

    # ── Circuit breaker ──────────────────────────────────────────────────

    def is_circuit_open(self, name: str) -> bool:
        """Return True if the circuit is open and the recovery window hasn't passed."""
        state = self._circuits.get(name)
        if not state or state.opened_at is None:
            return False
        if time.monotonic() - state.opened_at >= RECOVERY_SECS:
            # Recovery window passed — allow a probe request (half-open)
            return False
        return True

    def record_failure(self, name: str) -> None:
        state = self._circuits.setdefault(name, _CircuitState())
        already_open = state.failures >= FAILURE_THRESHOLD
        state.failures += 1
        if state.failures >= FAILURE_THRESHOLD:
            if state.opened_at is None:
                # First time crossing threshold — open the circuit
                state.opened_at = time.monotonic()
            elif already_open:
                # Probe failed while in HALF_OPEN — reset recovery timer
                state.opened_at = time.monotonic()

    def record_success(self, name: str) -> None:
        state = self._circuits.get(name)
        if state:
            state.failures = 0
            state.opened_at = None

    def circuit_status(self, name: str) -> str:
        """Return 'CLOSED', 'OPEN', or 'HALF_OPEN' for status reporting."""
        state = self._circuits.get(name)
        if not state or state.opened_at is None:
            return "CLOSED"
        elapsed = time.monotonic() - state.opened_at
        if elapsed >= RECOVERY_SECS:
            return "HALF_OPEN"
        return "OPEN"


# Module-level singleton — import and use directly
registry = AgentRegistry()
