// Loads HITL items for global inbox page
async function loadInbox() {
  const container = document.getElementById('inbox-content');
  if (!container) return;

  // Placeholder — real HITL data comes from agent-specific endpoints
  // Each agent exposes GET /hitl and POST /hitl/{id}/approve|reject
  const agents = ['gmail-agent', 'calendar-agent', 'budget-agent', 'ticktick-agent'];
  let html = '';

  for (const name of agents) {
    let items = [];
    try {
      const res = await fetch(`/api/agent/${name}/hitl`);
      if (res.ok) items = await res.json();
    } catch { /* agent offline */ }

    html += `<div class="inbox-section">
      <div class="inbox-agent-header">> ${name} (${items.length} pending)</div>`;

    if (items.length === 0) {
      html += `<div style="color:var(--text-dim);font-size:11px;padding:8px 0">no pending items</div>`;
    } else {
      for (const item of items) {
        html += `
          <div class="hitl-item">
            <div class="hitl-item-header">${item.title || 'Pending approval'}</div>
            <div class="hitl-item-body">${item.description || ''}</div>
            <div class="hitl-actions">
              <button class="btn btn-approve" onclick="handleHITL('${name}','${item.id}','approve')">approve</button>
              <button class="btn btn-reject"  onclick="handleHITL('${name}','${item.id}','reject')">reject</button>
            </div>
          </div>`;
      }
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

async function handleHITL(agentName, itemId, action) {
  await fetch(`/api/agent/${agentName}/hitl/${itemId}/${action}`, { method: 'POST' });
  loadInbox();
}

loadInbox();
