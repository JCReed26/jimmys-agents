import { LucideIcon, Mail, Calendar, DollarSign, Zap } from 'lucide-react';

export interface AgentConfig {
  name: string;
  displayName: string;
  /** Agent URL — points to localhost for local dev, LangSmith URL in production */
  url: string;
  /** LangSmith deployment URL — empty string means use `url` (local dev) */
  langsmithUrl: string;
  port: number;
  graphId: string;
  icon: LucideIcon;
  description: string;
  accentColor: string;
  accentColorRgb: string;
  type: 'agent';
}

export const AGENTS: Record<string, AgentConfig> = {
  "template-agent": {
    name: "template-agent",
    displayName: "Template",
    url: process.env.NEXT_PUBLIC_TEMPLATE_AGENT_URL ?? "http://localhost:8000",
    langsmithUrl: process.env.NEXT_PUBLIC_TEMPLATE_LANGSMITH_URL ?? "",
    port: 8000,
    graphId: "agent",
    icon: Zap,
    description: "Reference agent — Tavily search, subagents, todo list, full deepagents pattern",
    accentColor: "#6366f1",
    accentColorRgb: "99,102,241",
    type: "agent",
  },
  "gmail-agent": {
    name: "gmail-agent",
    displayName: "Gmail",
    url: process.env.NEXT_PUBLIC_GMAIL_AGENT_URL ?? "http://localhost:8001",
    langsmithUrl: process.env.NEXT_PUBLIC_GMAIL_LANGSMITH_URL ?? "",
    port: 8001,
    graphId: "agent",
    icon: Mail,
    description: "Polls inbox every 30 min, classifies and handles emails",
    accentColor: "#00ff88",
    accentColorRgb: "0,255,136",
    type: "agent",
  },
  "calendar-agent": {
    name: "calendar-agent",
    displayName: "Calendar",
    url: process.env.NEXT_PUBLIC_CALENDAR_AGENT_URL ?? "http://localhost:8002",
    langsmithUrl: process.env.NEXT_PUBLIC_CALENDAR_LANGSMITH_URL ?? "",
    port: 8002,
    graphId: "agent",
    icon: Calendar,
    description: "Google Calendar CRUD — scheduling and event management",
    accentColor: "#00d4ff",
    accentColorRgb: "0,212,255",
    type: "agent",
  },
  "budget-agent": {
    name: "budget-agent",
    displayName: "Budget",
    url: process.env.NEXT_PUBLIC_BUDGET_AGENT_URL ?? "http://localhost:8003",
    langsmithUrl: process.env.NEXT_PUBLIC_BUDGET_LANGSMITH_URL ?? "",
    port: 8003,
    graphId: "agent",
    icon: DollarSign,
    description: "Google Sheets budget tracking and financial summaries",
    accentColor: "#a855f7",
    accentColorRgb: "168,85,247",
    type: "agent",
  },
};

export const ALL_SOURCES: Record<string, AgentConfig> = { ...AGENTS };

export function getAgent(name: string): AgentConfig | undefined {
  return ALL_SOURCES[name];
}

/** Returns the active URL for an agent — LangSmith URL if set, else local URL */
export function getAgentUrl(cfg: AgentConfig): string {
  return cfg.langsmithUrl || cfg.url;
}

export const AGENT_NAMES = Object.keys(AGENTS);
export const ALL_SOURCE_NAMES = Object.keys(ALL_SOURCES);
