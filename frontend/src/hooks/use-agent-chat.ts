import { useState, useCallback } from 'react';

export interface Message {
  id: string;
  role: 'human' | 'assistant';
  content: string;
  thinking?: string;
  streaming?: boolean;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: string;
    result?: string;
  }>;
}

function getOrCreateThreadId(agent: string): string {
  const key = `jimmys-agents:thread:${agent}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const newId = `thread-${agent}-${crypto.randomUUID()}`;
  localStorage.setItem(key, newId);
  return newId;
}

export function useAgentChat(agentName: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'error'>('idle');

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const threadId = getOrCreateThreadId(agentName);

    const userMessage: Message = {
      id: `user-${crypto.randomUUID()}`,
      role: 'human',
      content,
    };
    setMessages(prev => [...prev, userMessage]);

    setIsLoading(true);
    setError(null);

    try {
      const allMessages = await new Promise<Message[]>(resolve => {
        setMessages(prev => { resolve(prev); return prev; });
      });

      const bodyMessages = allMessages.map(m => ({
        role: m.role === 'human' ? 'user' : 'assistant',
        content: m.content,
      }));

      const response = await fetch(`/api/chat/${agentName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          messages: bodyMessages,
        }),
      });

      if (!response.ok) throw new Error(response.statusText);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: { type: string; [key: string]: unknown };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          switch (event.type) {
            case 'RUN_STARTED':
              setRunStatus('running');
              break;

            case 'TEXT_MESSAGE_START':
              setMessages(prev => [
                ...prev,
                {
                  id: event.messageId as string,
                  role: 'assistant' as const,
                  content: '',
                  streaming: true,
                },
              ]);
              break;

            case 'TEXT_MESSAGE_CONTENT':
              setMessages(prev =>
                prev.map(m =>
                  m.id === event.messageId
                    ? { ...m, content: m.content + (event.delta as string) }
                    : m
                )
              );
              break;

            case 'TEXT_MESSAGE_END':
              setMessages(prev =>
                prev.map(m =>
                  m.id === event.messageId ? { ...m, streaming: false } : m
                )
              );
              break;

            case 'TOOL_CALL_START':
              setMessages(prev =>
                prev.map(m =>
                  m.id === event.parentMessageId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []),
                          {
                            id: event.toolCallId as string,
                            name: event.toolCallName as string,
                            args: '',
                            result: undefined,
                          },
                        ],
                      }
                    : m
                )
              );
              break;

            case 'TOOL_CALL_RESULT':
              setMessages(prev =>
                prev.map(m => ({
                  ...m,
                  toolCalls: m.toolCalls?.map(tc =>
                    tc.id === event.toolCallId
                      ? { ...tc, result: event.content as string }
                      : tc
                  ),
                }))
              );
              break;

            case 'RUN_FINISHED':
              setRunStatus('idle');
              break;

            case 'RUN_ERROR':
              setRunStatus('error');
              setError(event.message as string);
              break;
          }
        }
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      setRunStatus('error');
    } finally {
      setIsLoading(false);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = { ...lastMsg, streaming: false };
        }
        return newMessages;
      });
    }
  }, [agentName]);

  return { messages, sendMessage, isLoading, error, runStatus };
}
