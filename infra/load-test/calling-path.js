// Day 66 — k6 load test for the read-heavy dashboard + call-path APIs at target concurrency.
// Usage: BASE=https://api.vocaliq.dev TOKEN=<jwt> TENANT=<id> k6 run infra/load-test/calling-path.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // ramp to 50 VUs
    { duration: '3m', target: 200 },  // sustain 200 concurrent
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'], // p95 under 800ms (ties to the latency SLO)
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
};

const BASE = __ENV.BASE || 'http://localhost:3001';
const headers = {
  authorization: `Bearer ${__ENV.TOKEN || ''}`,
  'x-tenant-id': __ENV.TENANT || '',
};

export default function () {
  const status = http.get(`${BASE}/status`);
  check(status, { 'status 200': (r) => r.status === 200 });

  const live = http.get(`${BASE}/analytics/live`, { headers });
  check(live, { 'live 200': (r) => r.status === 200 });

  const agents = http.get(`${BASE}/agents`, { headers });
  check(agents, { 'agents 200': (r) => r.status === 200 });

  sleep(1);
}
