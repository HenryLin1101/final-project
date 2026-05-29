// Simulate an emergency-event burst of safety-report submissions.
//
// Usage:
//   BASE_URL=http://34.146.138.147 \
//   EVENT_ID=<active-event-id> \
//   TOKEN=<jwt> \
//   k6 run infra/k6/safety-report-burst.js
//
// Tips:
//   - Get TOKEN by POSTing to /api/v1/auth/login with an EMPLOYEE seed account.
//   - Without TOKEN/EVENT_ID the script falls back to /health to verify the script
//     itself runs, but the report endpoint will respond 401.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const EVENT_ID = __ENV.EVENT_ID || 'evt-1';
const TOKEN = __ENV.TOKEN || '';

const accepted = new Counter('reports_accepted_202');
const rejected = new Counter('reports_rejected_non_202');
const latency = new Trend('report_latency_ms', true);

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 },
        { duration: '20s', target: 500 },
        { duration: '20s', target: 500 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'reports_accepted_202': ['count>5000'],
    'http_req_failed': ['rate<0.05'],
    'http_req_duration{name:submit}': ['p(95)<800'],
  },
};

export default function () {
  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/reports`;
  const payload = JSON.stringify({
    status: Math.random() < 0.9 ? 'SAFE' : 'NEED_HELP',
    message: 'k6 burst test',
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    tags: { name: 'submit' },
  };

  const t0 = Date.now();
  const res = http.post(url, payload, params);
  latency.add(Date.now() - t0);

  const ok = check(res, {
    'status is 202': (r) => r.status === 202,
    'body has jobId': (r) => {
      try {
        return !!JSON.parse(r.body).jobId;
      } catch {
        return false;
      }
    },
  });
  if (ok) accepted.add(1);
  else rejected.add(1);

  sleep(0.05);
}
