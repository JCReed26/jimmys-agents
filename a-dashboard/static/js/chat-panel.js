const panel = document.getElementById('chat-panel');
if (!panel) throw new Error('chat-panel not found');

const agentName = panel.dataset.agent;
const available = panel.dataset.available === 'true';
const messagesEl = document.getElementById('chat-messages');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');

function appendMessage(role, text, streaming = false) {
  const div = document.createElement('div');
  div.className = `chat-message ${role}${streaming ? ' streaming' : ''}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || !available) return;
  inputEl.value = '';
  inputEl.disabled = true;
  sendBtn.disabled = true;

  appendMessage('user', text);
  const agentMsg = appendMessage('agent', '', true);

  try {
    const res = await fetch(`/api/agent/${agentName}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { messages: [{ role: 'human', content: text }] } }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE: parse data: lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(line.slice(6));
            const content = chunk?.messages?.at(-1)?.content;
            if (content) agentMsg.textContent = content;
          } catch { /* partial chunk */ }
        }
      }
    }
  } catch (err) {
    agentMsg.textContent = `error: ${err.message}`;
  } finally {
    agentMsg.classList.remove('streaming');
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

sendBtn?.addEventListener('click', sendMessage);
inputEl?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
