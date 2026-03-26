import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Validate name to prevent directory traversal
  if (!name.match(/^[a-zA-Z0-9_-]+$/)) {
    return NextResponse.json({ error: 'Invalid workflow name' }, { status: 400 });
  }

  // Assuming all workflows share the same history file for now, or per workflow?
  // job-app-chain uses ../data/run_history.json
  // We can look up the file path from config if needed, but for now let's default to shared location
  
  const dataDir = path.resolve(process.cwd(), '../data');
  const historyFile = path.join(dataDir, 'run_history.json');

  if (!fs.existsSync(historyFile)) {
    return NextResponse.json({ last_run: null, runs: [] });
  }

  try {
    const content = fs.readFileSync(historyFile, 'utf8');
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading history file:', error);
    return NextResponse.json({ error: 'Failed to read history' }, { status: 500 });
  }
}
