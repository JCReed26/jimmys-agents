import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface AgentCardProps {
  name: string;
  status: 'RUNNING' | 'IDLE' | 'DOWN' | 'ERROR' | 'SHEET' | 'CONNECTED';
  metrics: {
    avgLatency?: string;
    totalRuns?: number;
    successRate?: string;
    topTool?: string;
    lastRun?: string;
  };
  description: string;
  href: string;
  icon: LucideIcon;
}

export function AgentCard({ name, status, metrics, description, href, icon: Icon }: AgentCardProps) {
  const statusColor = {
    'RUNNING': 'status-running',
    'IDLE': 'status-idle',
    'DOWN': 'status-down',
    'ERROR': 'status-error',
    'SHEET': 'status-sheet',
    'CONNECTED': 'status-idle', 
  }[status] || 'status-idle';

  return (
    <Link 
      href={href} 
      className="block bg-card border border-border p-4 rounded-radius hover:bg-hover hover:border-border-accent transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="text-secondary" size={16} />
          <span className="text-xs font-medium text-primary">&gt; {name}</span>
        </div>
        <span className={`status-badge ${statusColor}`}>{status}</span>
      </div>

      <div className="space-y-2 text-[11px]">
        {metrics.avgLatency && (
          <div className="flex justify-between border-b border-border pb-1">
            <span className="text-secondary">avg latency</span>
            <span className="text-accent-cyan font-medium">{metrics.avgLatency}</span>
          </div>
        )}
        {metrics.totalRuns !== undefined && (
          <div className="flex justify-between border-b border-border pb-1">
            <span className="text-secondary">total runs</span>
            <span className="text-primary font-medium">{metrics.totalRuns}</span>
          </div>
        )}
        {metrics.successRate && (
          <div className="flex justify-between border-b border-border pb-1">
            <span className="text-secondary">success rate</span>
            <span className="text-primary font-medium">{metrics.successRate}</span>
          </div>
        )}
        {metrics.topTool && (
          <div className="flex justify-between border-b border-border pb-1">
            <span className="text-secondary">top tool</span>
            <span className="text-primary font-medium">{metrics.topTool}</span>
          </div>
        )}
        {metrics.lastRun && (
          <div className="flex justify-between border-b border-border pb-1">
            <span className="text-secondary">last run</span>
            <span className="text-primary font-medium">{metrics.lastRun}</span>
          </div>
        )}
        
        <div className="mt-4 text-[10px] text-dim">{description}</div>
      </div>
    </Link>
  );
}
