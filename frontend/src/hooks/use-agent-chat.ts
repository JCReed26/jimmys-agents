import { useState, useCallback, useEffect, useRef } from 'react';

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

export interface Thread {
  id: string;
  label: string;
  created_at: string;
}

function getThreads(agent: string): Thread[] {
  try {
    const key = `jimmys-agents:threads:${agent}`;
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse threads from local storage", e);
  }
  
  // Migration path: check if old single thread exists
  const oldKey = `jimmys-agents:thread:${agent}`;
  const oldId = localStorage.getItem(oldKey);
  if (oldId) {
    const initialThreads = [{
      id: oldId,
      label: "Thread 1",
      created_at: new Date().toISOString()
    }];
    try {
      localStorage.setItem(`jimmys-agents:threads:${agent}`, JSON.stringify(initialThreads));
      localStorage.removeItem(oldKey); // Clean up old key
      return initialThreads;
    } catch {
      // ignore
    }
  }
  
  return [];
}

function saveThreads(agent: string, threads: Thread[]) {
  const key = `jimmys-agents:threads:${agent}`;
  // Keep max 10 threads
  const toSave = threads.slice(0, 10);
  localStorage.setItem(key, JSON.stringify(toSave));
}

function createNewThread(agent: string, threadCount: number): Thread {
  return {
    id: `thread-${agent}-${crypto.randomUUID()}`,
    label: `Thread ${threadCount + 1}`,
    created_at: new Date().toISOString()
  };
}

export function useAgentChat(agentName: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'error'>('idle');

  // Thread management
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Stale-load cancellation: each history fetch gets a unique symbol
  const loadIdRef = useRef<symbol | null>(null);
  // In-flight chat request cancellation
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight chat request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Initialize threads on mount
  useEffect(() => {
    const loadedThreads = getThreads(agentName);
    
    if (loadedThreads.length === 0) {
      const newThread = createNewThread(agentName, 0);
      setThreads([newThread]);
      setCurrentThreadId(newThread.id);
      saveThreads(agentName, [newThread]);
    } else {
      setThreads(loadedThreads);
      setCurrentThreadId(loadedThreads[0].id); // Select most recent by default
    }
  }, [agentName]);

  // Load history when thread changes — symbol-gated to drop stale responses
  useEffect(() => {
    if (!currentThreadId) return;

    const loadId = Symbol();
    loadIdRef.current = loadId;
    setIsInitializing(true);
    setError(null);

    async function loadHistory() {
      try {
        const response = await fetch(`/api/chat/${agentName}?thread_id=${encodeURIComponent(currentThreadId!)}`);

        // Drop result if a newer load started while we were awaiting
        if (loadIdRef.current !== loadId) return;

        if (!response.ok) {
          if (response.status !== 404) {
            throw new Error(`Failed to load history: ${response.statusText}`);
          }
          setMessages([]);
          return;
        }

        const data = await response.json();
        if (loadIdRef.current !== loadId) return;

        if (data.messages && Array.isArray(data.messages)) {
          const formattedMessages = data.messages.map((m: { id?: string; role?: string; content?: string }, idx: number) => ({
            id: m.id || `msg-${idx}`,
            role: m.role === 'user' ? 'human' : 'assistant',
            content: m.content || '',
          }));
          setMessages(formattedMessages);
        } else {
          setMessages([]);
        }
      } catch (err) {
        if (loadIdRef.current !== loadId) return;
        console.error("Error loading history:", err);
        setError("Failed to load chat history");
        setMessages([]);
      } finally {
        if (loadIdRef.current === loadId) setIsInitializing(false);
      }
    }

    loadHistory();
  }, [agentName, currentThreadId]);

  const switchThread = useCallback((threadId: string) => {
    setCurrentThreadId(threadId);
  }, []);

  const startNewThread = useCallback(() => {
    const newThread = createNewThread(agentName, threads.length);
    const updatedThreads = [newThread, ...threads]; // Prepend new thread
    setThreads(updatedThreads);
    saveThreads(agentName, updatedThreads);
    setCurrentThreadId(newThread.id);
    setMessages([]);
  }, [agentName, threads]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !currentThreadId) return;

    // Cancel any previously in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
          thread_id: currentThreadId,
          messages: bodyMessages,
        }),
        signal: controller.signal,
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
      // Ignore abort errors — they're intentional (new message sent or unmount)
      if (err instanceof Error && err.name === 'AbortError') return;
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
  }, [agentName, currentThreadId]);

  return { 
    messages, 
    sendMessage, 
    isLoading, 
    error, 
    runStatus,
    threads,
    currentThreadId,
    switchThread,
    startNewThread,
    isInitializing
  };
}
