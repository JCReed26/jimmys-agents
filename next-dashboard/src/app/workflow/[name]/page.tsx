"use client";

import { use, useState } from 'react';
import { WORKFLOWS } from '@/lib/agents';
import { ArrowLeft, Play, BarChart2, Terminal, Share2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkflowLogs } from '@/components/workflow/workflow-logs';
import { WorkflowGraph } from '@/components/workflow/workflow-graph';
import { WorkflowStats } from '@/components/workflow/workflow-stats';

type Tab = 'logs' | 'graph' | 'stats';

export default function WorkflowPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const config = WORKFLOWS[name];
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [isRunning, setIsRunning] = useState(false);

  if (!config) {
    notFound();
  }

  const handleRun = async () => {
    setIsRunning(true);
    try {
        await fetch(`/api/chat/${name}`, {
            method: 'POST',
            body: JSON.stringify({ input: {} })
        });
        // We might want to switch to logs tab automatically
        setActiveTab('logs');
    } catch (e) {
        console.error("Failed to run workflow", e);
    } finally {
        setIsRunning(false);
    }
  };

  const Icon = config.icon;

  const status = isRunning ? 'RUNNING' : 'CONNECTED';

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xs text-secondary hover:text-primary transition-colors">
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
           <span className="text-xs text-secondary">Status:</span>
           <span className={`status-badge ${status === 'RUNNING' ? 'status-running' : 'status-idle'}`}>
             {status}
           </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 flex-1 flex flex-col overflow-hidden">
        {/* Workflow Info & Controls */}
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
          
          <button 
            onClick={handleRun}
            disabled={isRunning}
            className={`flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded transition-colors text-xs font-medium ${
                isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent-green hover:text-accent-green'
            }`}
          >
            <Play size={14} />
            <span>{isRunning ? 'Running...' : 'Run Workflow'}</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded transition-colors text-xs font-medium opacity-50 cursor-not-allowed">
            <span>Config</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-border mb-4">
            <TabButton 
                active={activeTab === 'stats'} 
                onClick={() => setActiveTab('stats')} 
                icon={BarChart2} 
                label="Stats" 
            />
            <TabButton 
                active={activeTab === 'graph'} 
                onClick={() => setActiveTab('graph')} 
                icon={Share2} 
                label="Graph" 
            />
            <TabButton 
                active={activeTab === 'logs'} 
                onClick={() => setActiveTab('logs')} 
                icon={Terminal} 
                label="Logs" 
            />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
            {activeTab === 'logs' && <WorkflowLogs name={name} />}
            {activeTab === 'graph' && <WorkflowGraph name={name} />}
            {activeTab === 'stats' && <WorkflowStats name={name} />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-2 pb-2 text-xs font-medium border-b-2 transition-colors ${
                active 
                ? 'border-primary text-primary' 
                : 'border-transparent text-secondary hover:text-primary'
            }`}
        >
            <Icon size={14} />
            <span>{label}</span>
        </button>
    );
}
