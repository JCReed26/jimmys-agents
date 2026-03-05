// Polls /api/agents and refreshes card status/metrics in-place
async function refreshAgentCards() {
  try {
    const res = await fetch('/api/agents');
    const data = await res.json();
    for (const [name, info] of Object.entries(data)) {
      const card = document.querySelector(`[data-agent="${name}"]`);
      if (!card) continue;
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.textContent = info.status;
        badge.className = `status-badge status-${info.status.toLowerCase()}`;
      }
    }
  } catch (e) {
    // dashboard works even if poll fails
  }
}

refreshAgentCards();
setInterval(refreshAgentCards, 10_000);
