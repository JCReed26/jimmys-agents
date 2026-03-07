"use client";

import { use, useEffect, useState, useRef } from 'react';
import { WORKFLOWS } from '@/lib/agents';
import { ArrowLeft, Play, Terminal } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default function WorkflowPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const config = WORKFLOWS[name];
  const [logs, setLogs] = useState<string>('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  if (!config) {
    notFound();
  }

  useEffect(() => {
    // Stream logs
    const eventSource = new EventSource(`/api/logs/${name}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs(prev => prev + data);
      } catch (e) {
        console.error('Error parsing log data', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [name]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const Icon = config.icon;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xs text-secondary hover:text-primary transition-colors">
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
           <span className="text-xs text-secondary">Status:</span>
           <span className="status-badge status-idle">IDLE</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface rounded-md border border-border">
              <Icon size={20} className="text-accent-violet" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-primary">{config.name}</h1>
              <div className="text-[10px] text-secondary">{config.description}</div>
            </div>
          </div>
          
          <button className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded hover:border-accent-green hover:text-accent-green transition-colors text-xs font-medium">
            <Play size={14} />
            <span>Run Workflow</span>
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2 text-xs text-dim">
           <Terminal size={14} />
           <span>Live Logs</span>
        </div>
        
        <div 
          ref={logContainerRef}
          className="flex-1 bg-black border border-border rounded p-4 font-mono text-xs text-secondary overflow-y-auto whitespace-pre-wrap break-all"
        >
          {logs || <span className="text-dim italic">Waiting for logs...</span>}
        </div>
      </div>
    </div>
  );
}
