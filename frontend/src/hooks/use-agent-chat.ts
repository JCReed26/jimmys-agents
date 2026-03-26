import { useState, useCallback } from 'react';

export interface Message {
  role: 'human' | 'ai' | 'system';
  content: string;
  thinking?: string;
  streaming?: boolean;
}

export function useAgentChat(agentName: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = { role: 'human', content };
    setMessages(prev => [...prev, userMessage]);
    
    // Add placeholder AI message
    setMessages(prev => [...prev, { role: 'ai', content: '', thinking: '', streaming: true }]);
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chat/${agentName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            messages: [{ role: 'human', content }]
          },
          config: {
            configurable: {
              thread_id: `thread_${Date.now()}`
            }
          },
          stream_mode: ["updates"]
        })
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
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              
              // Handle "updates" stream mode
              // data is usually { messages: [...] } or just the chunk depending on config
              // In updates mode, it sends the new messages added/updated.
              
              // If we get an object with key corresponding to node name (e.g. 'agent'), 
              // the value is the state update from that node.
              // But typically 'updates' stream sends { "messages": [chunk] } if the node returned messages.
              
              // Let's inspect the structure.
              // If data has 'messages', iterate.
              // Or if data itself is a message chunk (in some modes).
              
              // LangGraph 'updates' usually looks like:
              // { "agent": { "messages": [AIMessageChunk(...)] } }
              
              let chunks: any[] = [];
              
              // Normalized check for different response shapes
              if (data && typeof data === 'object') {
                 // Check for node updates
                 for (const key in data) {
                    if (data[key] && data[key].messages) {
                       chunks.push(...(Array.isArray(data[key].messages) ? data[key].messages : [data[key].messages]));
                    } else if (key === 'messages') {
                        chunks.push(...(Array.isArray(data.messages) ? data.messages : [data.messages]));
                    }
                 }
                 // Direct chunk (less common in updates mode but possible)
                 if (data.content !== undefined || data.tool_calls !== undefined) {
                    chunks.push(data);
                 }
              }

              for (const chunk of chunks) {
                 // Extract tool calls (Thinking)
                 let thoughtUpdate = '';
                 
                 // 1. Tool Calls in AI Message
                 if (chunk.tool_calls && chunk.tool_calls.length > 0) {
                    for (const tool of chunk.tool_calls) {
                       thoughtUpdate += `> Calling tool \`${tool.name}\` with args: ${JSON.stringify(tool.args)}\n\n`;
                    }
                 }
                 // 2. Tool Message (Result)
                 if (chunk.type === 'tool' || chunk.role === 'tool') {
                    thoughtUpdate += `> Tool \`${chunk.name || 'unknown'}\` output: ${chunk.content}\n\n`;
                 }
                 
                 // 3. AI Content (Output)
                 // Only update content if it's an AI message
                 let contentUpdate = '';
                 if (chunk.type === 'ai' || chunk.role === 'ai') {
                    if (typeof chunk.content === 'string') {
                        contentUpdate = chunk.content;
                    } else if (Array.isArray(chunk.content)) {
                        // Handle multimodal content or complex structures if needed
                        contentUpdate = chunk.content.map((c: any) => typeof c === 'string' ? c : (c.text || '')).join('');
                    } else if (typeof chunk.content === 'object') {
                         // Fallback for object content (shouldn't happen for text agents, but just in case)
                         contentUpdate = ''; // Don't render [object Object]
                    }
                 }

                 if (thoughtUpdate || contentUpdate) {
                     setMessages(prev => {
                        const newMessages = [...prev];
                        const lastMsg = newMessages[newMessages.length - 1];
                        if (lastMsg.role === 'ai') {
                           newMessages[newMessages.length - 1] = {
                              ...lastMsg,
                              content: lastMsg.content + contentUpdate,
                              thinking: (lastMsg.thinking || '') + thoughtUpdate
                           };
                        }
                        return newMessages;
                     });
                 }
              }

            } catch (e) {
              console.warn('Error parsing SSE data', e);
            }
          }
        }
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred');
      // Append error to AI message
      setMessages(prev => {
         const newMessages = [...prev];
         const lastMsg = newMessages[newMessages.length - 1];
         if (lastMsg.role === 'ai') {
             newMessages[newMessages.length - 1] = {
                 ...lastMsg,
                 content: lastMsg.content + `\n\nError: ${err.message}`,
                 streaming: false
             };
         }
         return newMessages;
      });
    } finally {
      setIsLoading(false);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'ai') {
           newMessages[newMessages.length - 1] = { ...lastMsg, streaming: false };
        }
        return newMessages;
      });
    }
  }, [agentName]);

  return { messages, sendMessage, isLoading, error };
}
