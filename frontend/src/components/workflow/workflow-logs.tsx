"use client";

import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';

interface WorkflowLogsProps {
  name: string;
}

export function WorkflowLogs({ name }: WorkflowLogsProps) {
  const [logs, setLogs] = useState<string>('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Stream logs
    const eventSource = new EventSource(`/api/logs/${name}`);
    
    eventSource.onmessage = (event) => {
      try {
        // The API sends JSON strings wrapped in data: ...
        // Check if event.data is already a string or JSON
        let data = event.data;
        // The previous implementation did JSON.parse(event.data)
        // Let's stick to that if the API sends JSON stringified chunks
        if (data.startsWith('"') && data.endsWith('"')) {
             data = JSON.parse(data);
        }
        setLogs(prev => prev + data);
      } catch (e) {
        console.error('Error parsing log data', e);
        // Fallback: just append raw data
        setLogs(prev => prev + event.data);
      }
    };

    eventSource.onerror = (e) => {
        // console.error('EventSource failed:', e);
        eventSource.close();
    }

    return () => {
      eventSource.close();
    };
  }, [name]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2 text-xs text-dim">
         <Terminal size={14} />
         <span>Live Logs</span>
      </div>
      
      <div 
        ref={logContainerRef}
        className="flex-1 bg-black border border-border rounded p-4 font-mono text-xs text-secondary overflow-y-auto whitespace-pre-wrap break-all min-h-[300px]"
      >
        {logs || <span className="text-dim italic">Waiting for logs...</span>}
      </div>
    </div>
  );
}
