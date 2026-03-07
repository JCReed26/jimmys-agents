"use client";

import { useAgentChat } from '@/hooks/use-agent-chat';
import { MessageBubble } from './message-bubble';
import { Send, Loader2 } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface ChatInterfaceProps {
  agentName: string;
}

export function ChatInterface({ agentName }: ChatInterfaceProps) {
  const { messages, sendMessage, isLoading, error } = useAgentChat(agentName);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputRef.current?.value.trim();
    if (text) {
      sendMessage(text);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} {...msg} />
        ))}
        {error && (
          <div className="text-accent-red text-xs text-center p-2 bg-accent-red/10 rounded">
            Error: {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border bg-surface">
        <div className="relative">
          <textarea
            ref={inputRef}
            className="w-full bg-base border border-border rounded-md p-3 pr-12 text-sm focus:outline-none focus:border-accent-violet resize-none h-14"
            placeholder={`Message ${agentName}...`}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="absolute right-2 bottom-2 p-2 text-secondary hover:text-accent-violet disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <div className="text-[10px] text-dim mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
