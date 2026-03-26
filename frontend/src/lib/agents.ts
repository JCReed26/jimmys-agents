import { LucideIcon, Mail, Calendar, DollarSign, GitBranch } from 'lucide-react';

export interface AgentConfig {
  name: string;
  displayName: string;
  url: string;
  port: number;
  icon: LucideIcon;
  description: string;
  accentColor: string;
  accentColorRgb: string;
  type: 'agent' | 'workflow';
}

/** Conversational chatbot agents — chat is the primary interface */
export const AGENTS: Record<string, AgentConfig> = {
  "gmail-agent": {
    name: "gmail-agent",
    displayName: "Gmail",
    url: "http://localhost:8001",
    port: 8001,
    icon: Mail,
    description: "Polls inbox every 30 min, classifies and handles emails",
    accentColor: "#00ff88",
    accentColorRgb: "0,255,136",
    type: "agent",
  },
  "calendar-agent": {
    name: "calendar-agent",
    displayName: "Calendar",
    url: "http://localhost:8002",
    port: 8002,
    icon: Calendar,
    description: "Google Calendar CRUD — scheduling and event management",
    accentColor: "#00d4ff",
    accentColorRgb: "0,212,255",
    type: "agent",
  },
  "budget-agent": {
    name: "budget-agent",
    displayName: "Budget",
    url: "http://localhost:8003",
    port: 8003,
    icon: DollarSign,
    description: "Google Sheets budget tracking and financial summaries",
    accentColor: "#a855f7",
    accentColorRgb: "168,85,247",
    type: "agent",
  },
};

/** Deterministic graph automations — graph visualization is the primary interface */
export const WORKFLOWS: Record<string, AgentConfig> = {
  "job-app-chain": {
    name: "job-app-chain",
    displayName: "Job Applications",
    url: "http://localhost:8004",
    port: 8004,
    icon: GitBranch,
    description: "LangGraph workflow: scrape → classify → optimize → apply",
    accentColor: "#f59e0b",
    accentColorRgb: "245,158,11",
    type: "workflow",
  },
};

/** All sources combined (for shared monitoring pages) */
export const ALL_SOURCES: Record<string, AgentConfig> = {
  ...AGENTS,
  ...WORKFLOWS,
};

export function getAgent(name: string): AgentConfig | undefined {
  return ALL_SOURCES[name];
}

export const AGENT_NAMES = Object.keys(AGENTS);
export const WORKFLOW_NAMES = Object.keys(WORKFLOWS);
export const ALL_SOURCE_NAMES = Object.keys(ALL_SOURCES);
