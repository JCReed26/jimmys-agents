"use client";

import { use, useEffect, useState } from 'react';
import { ChatInterface } from '@/components/chat/chat-interface';
import { AGENTS } from '@/lib/agents';
import { ArrowLeft, Activity, Play, Settings } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const config = AGENTS[name];
  const [status, setStatus] = useState('IDLE');

  if (!config) {
    notFound();
  }

  useEffect(() => {
    // Poll status
    const checkStatus = async () => {
        try {
            const res = await fetch('/api/agents');
            if (res.ok) {
                const data = await res.json();
                if (data[name]) {
                    setStatus(data[name].status);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [name]);

  const Icon = config.icon;

  return (
    <div className="h-full flex flex-col md:flex-row gap-4">
      {/* Sidebar / Info Panel */}
      <div className="w-full md:w-80 flex flex-col gap-4">
        <Link href="/" className="flex items-center gap-2 text-xs text-secondary hover:text-primary transition-colors mb-2">
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </Link>
        
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-surface rounded-md border border-border">
              <Icon size={20} className="text-accent-cyan" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-primary">{config.name}</h1>
              <div className={`text-[10px] font-medium ${
                status === 'RUNNING' ? 'text-accent-green' : 
                status === 'DOWN' ? 'text-accent-red' : 'text-secondary'
              }`}>
                {status}
              </div>
            </div>
          </div>
          
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-border">
               <span className="text-secondary">URL</span>
               <span className="text-primary font-mono text-[10px]">{config.url}</span>
            </div>
             <div className="flex justify-between py-2 border-b border-border">
               <span className="text-secondary">Port</span>
               <span className="text-primary font-mono">{config.port}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
               <span className="text-secondary">Description</span>
               <span className="text-primary text-right pl-4">{config.description}</span>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2 border border-border rounded hover:border-accent-violet hover:text-accent-violet transition-colors text-xs text-secondary">
               <Activity size={14} />
               <span>Logs</span>
            </button>
             <button className="flex-1 flex items-center justify-center gap-2 py-2 border border-border rounded hover:border-accent-cyan hover:text-accent-cyan transition-colors text-xs text-secondary">
               <Settings size={14} />
               <span>Config</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 h-[600px] md:h-auto min-h-[500px]">
         <ChatInterface agentName={name} />
      </div>
    </div>
  );
}
