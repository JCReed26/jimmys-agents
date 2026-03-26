"use client";

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, BarChart } from 'lucide-react';

interface RunEntry {
  timestamp: string;
  status: string;
  new_jobs_found?: number;
  optimized_jobs_processed?: number;
  error?: string;
}

interface HistoryData {
  last_run: string | null;
  runs: RunEntry[];
}

interface WorkflowStatsProps {
  name: string;
}

export function WorkflowStats({ name }: WorkflowStatsProps) {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/history/${name}`)
      .then(res => res.json())
      .then(data => {
        setHistory(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [name]);

  if (loading) return <div className="text-xs text-dim p-4">Loading stats...</div>;
  if (!history || !history.runs.length) return <div className="text-xs text-dim p-4">No run history available.</div>;

  const totalRuns = history.runs.length;
  const successfulRuns = history.runs.filter(r => r.status === 'success').length;
  const successRate = Math.round((successfulRuns / totalRuns) * 100);
  
  const totalJobsFound = history.runs.reduce((acc, curr) => acc + (curr.new_jobs_found || 0), 0);
  const totalOptimized = history.runs.reduce((acc, curr) => acc + (curr.optimized_jobs_processed || 0), 0);

  return (
    <div className="h-full overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard icon={BarChart} label="Total Runs" value={totalRuns} />
        <StatCard icon={CheckCircle} label="Success Rate" value={`${successRate}%`} />
        <StatCard icon={Clock} label="Last Run" value={history.last_run ? new Date(history.last_run).toLocaleString() : 'Never'} />
        <StatCard icon={BarChart} label="Jobs Found" value={totalJobsFound} />
        <StatCard icon={BarChart} label="Optimized" value={totalOptimized} />
      </div>

      <h3 className="text-sm font-medium text-primary mb-3">Recent Runs</h3>
      <div className="space-y-2">
        {[...history.runs].reverse().map((run, i) => (
          <div key={i} className="bg-surface border border-border rounded p-3 text-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              {run.status === 'success' ? (
                <CheckCircle size={14} className="text-accent-green" />
              ) : (
                <XCircle size={14} className="text-red-500" />
              )}
              <div>
                <div className="text-primary font-medium">{new Date(run.timestamp).toLocaleString()}</div>
                <div className="text-secondary">
                    {run.new_jobs_found !== undefined && `Found: ${run.new_jobs_found} | `}
                    {run.optimized_jobs_processed !== undefined && `Optimized: ${run.optimized_jobs_processed}`}
                    {run.error && <span className="text-red-400 block">{run.error}</span>}
                </div>
              </div>
            </div>
            <div className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${
                run.status === 'success' ? 'bg-accent-green/10 text-accent-green' : 'bg-red-500/10 text-red-500'
            }`}>
              {run.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any, label: string, value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded p-3 flex items-center gap-3">
      <div className="p-2 bg-background rounded-md border border-border text-secondary">
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[10px] text-secondary uppercase tracking-wider">{label}</div>
        <div className="text-lg font-bold text-primary">{value}</div>
      </div>
    </div>
  );
}
