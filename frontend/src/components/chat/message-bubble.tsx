import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';
import clsx from 'clsx';
import { Thinking } from './thinking';

export interface MessageBubbleProps {
  role: 'human' | 'ai' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  streaming?: boolean;
  id?: string;
  toolCalls?: Array<{ id: string; name: string; args: string; result?: string }>;
}

export function MessageBubble({ role, content, thinking, streaming }: MessageBubbleProps) {
  const isUser = role === 'human';

  return (
    <div className={clsx(
      "flex gap-4 p-4 rounded-xl text-sm max-w-3xl mx-auto transition-all duration-200",
      isUser ? "bg-surface border border-border" : "bg-transparent"
    )}>
      <div className={clsx(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border shadow-sm",
        isUser 
          ? "bg-secondary/10 border-border text-secondary" 
          : "bg-accent-violet/10 border-accent-violet/20 text-accent-violet"
      )}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      
      <div className="flex-1 space-y-2 overflow-hidden min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-[11px] text-dim uppercase tracking-wider">
            {isUser ? 'You' : 'Agent'}
          </span>
          {!isUser && streaming && (
            <span className="text-[10px] text-accent-green animate-pulse">● processing</span>
          )}
        </div>

        {/* Thinking Process (Tool Calls) */}
        {thinking && <Thinking content={thinking} />}

        {/* Main Content */}
        <div className={clsx(
          "prose prose-invert prose-sm max-w-none break-words leading-relaxed",
          !content && streaming && "animate-pulse text-dim"
        )}>
          {content ? (
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => <a {...props} className="text-accent-cyan hover:underline" target="_blank" rel="noopener noreferrer" />,
                code: ({ node, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return !className ? (
                    <code className="bg-surface px-1.5 py-0.5 rounded text-[12px] font-mono text-accent-yellow" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-surface border border-border rounded-lg p-3 overflow-x-auto my-3 text-[12px]">
                    {children}
                  </pre>
                ),
                ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2 text-secondary">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2 text-secondary">{children}</ol>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-accent-violet/50 pl-4 italic text-dim my-2">{children}</blockquote>,
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
             streaming && !thinking && (
                <div className="flex items-center gap-1.5 text-dim italic text-xs h-6">
                   <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                   <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                   <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
                </div>
             )
          )}
        </div>
        
        {streaming && content && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-accent-green animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
