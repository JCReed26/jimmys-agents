"use client";

import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

interface WorkflowGraphProps {
  name: string;
}

export function WorkflowGraph({ name }: WorkflowGraphProps) {
  const [graphDefinition, setGraphDefinition] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    // Fetch the mermaid definition
    fetch(`/${name}.mmd`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load graph definition');
        return res.text();
      })
      .then(text => {
        setGraphDefinition(text);
      })
      .catch(err => {
        console.error(err);
        setError('Could not load workflow graph.');
      });
  }, [name]);

  useEffect(() => {
    if (graphDefinition) {
      mermaid.contentLoaded();
    }
  }, [graphDefinition]);

  if (error) {
    return <div className="p-4 text-red-500 text-xs">{error}</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 bg-surface border border-border rounded p-4 overflow-auto flex items-center justify-center">
        {graphDefinition ? (
          <pre className="mermaid bg-transparent">
            {graphDefinition}
          </pre>
        ) : (
          <div className="text-dim text-xs italic">Loading graph...</div>
        )}
      </div>
    </div>
  );
}
