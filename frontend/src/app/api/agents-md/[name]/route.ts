import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { AGENTS } from '@/lib/agents';

// Read/write AGENTS.md directly from filesystem — no gateway needed.
const PROJECT_ROOT = path.join(process.cwd(), '..');

const AGENT_DIRS: Record<string, string> = {
  'gmail-agent':      'agents/gmail-agent',
  'calendar-agent':   'agents/calendar-agent',
  'budget-agent':     'agents/budget-deepagent',
  'job-search-agent': 'agents/job-search-agent',
};

function mdPath(name: string): string | null {
  const dir = AGENT_DIRS[name];
  return dir ? path.join(PROJECT_ROOT, dir, 'skills', 'AGENTS.md') : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const p = mdPath(name);
  if (!p) return NextResponse.json({ content: '' });
  try {
    const content = await readFile(p, 'utf-8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ content: '' });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const p = mdPath(name);
  if (!p) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  try {
    const { content } = await req.json();
    await writeFile(p, content, 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
