import { LucideIcon, Mail, Calendar, DollarSign, Briefcase } from 'lucide-react';

export interface AgentConfig {
  name: string;
  url: string;
  port: number;
  icon: LucideIcon;
  description: string;
}

export const AGENTS: Record<string, AgentConfig> = {
  "gmail-agent": {
    name: "gmail-agent",
    url: "http://localhost:8001",
    port: 8001,
    icon: Mail,
    description: "Polls inbox and classifies emails"
  },
  "calendar-agent": {
    name: "calendar-agent",
    url: "http://localhost:8002",
    port: 8002,
    icon: Calendar,
    description: "Google Calendar CRUD operations"
  },
  "budget-agent": {
    name: "budget-agent",
    url: "http://localhost:8003",
    port: 8003,
    icon: DollarSign,
    description: "Google Sheets budget tracking"
  },
};

export const WORKFLOWS = {
  "job-app-chain": {
    name: "job-app-chain",
    description: "Automated Job Application",
    history_file: "../data/run_history.json",
    icon: Briefcase
  }
};
