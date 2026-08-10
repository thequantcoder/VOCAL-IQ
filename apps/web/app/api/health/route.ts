import { NextResponse } from 'next/server';

/** Health route for local dev / CI / uptime checks. */
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'web' });
}
