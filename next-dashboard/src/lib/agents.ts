import { LucideIcon, Mail, Calendar, DollarSign, Briefcase } from 'lucide-react';

export interface AgentConfig {
  name: string;
  displayName: string;
  url: string;
  port: number;
  icon: LucideIcon;
  description: string;
  accentColor: string;      // CSS hex
  accentColorRgb: string;   // "r,g,b" for rgba()
  memoryPath: string;       // relative to project root
  rulesPath: string;
}

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
    memoryPath: "gmail-agent/MEMORY.md",
    rulesPath: "gmail-agent/RULES.md",
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
    memoryPath: "calendar-agent/MEMORY.md",
    rulesPath: "calendar-agent/RULES.md",
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
    memoryPath: "budget-agent/MEMORY.md",
    rulesPath: "budget-agent/RULES.md",
  },
  "job-app-chain": {
    name: "job-app-chain",
    displayName: "Job Chain",
    url: "http://localhost:8004",
    port: 8004,
    icon: Briefcase,
    description: "LangGraph workflow: scrape → classify → optimize → apply",
    accentColor: "#f59e0b",
    accentColorRgb: "245,158,11",
    memoryPath: "job-app-chain/MEMORY.md",
    rulesPath: "job-app-chain/RULES.md",
  },
};

// Legacy WORKFLOWS kept for backwards compat, but all agents are now in AGENTS
export const WORKFLOWS = AGENTS;

export function getAgent(name: string): AgentConfig | undefined {
  return AGENTS[name];
}

export const AGENT_NAMES = Object.keys(AGENTS);
