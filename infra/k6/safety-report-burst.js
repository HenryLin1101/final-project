/**
 * k6 緊急事件爆發測試 — 6767 人各回報一次
 *
 * 模擬地震演練時 6767 位員工同時提交安全回報。
 * 每個 VU 持有唯一帳號，每輪只 POST 一次，確保不重複觸發同一 user 的 rate limit。
 *
 * 前置作業：
 *   1. pnpm --filter api seed:loadtest        # 建立 6767 測試帳號
 *   2. pnpm loadtest:tokens                   # 離線產生 JWT JSON
 *   3. 準備一個 ACTIVE 事件（透過 admin 建立）
 *
 * 執行（建議在 GCP VM 而非 Cloud Shell，需 ~4GB RAM）：
 *   docker run --rm \
 *     -v "$PWD/infra/k6:/scripts" \
 *     -e BASE_URL=http://34.84.115.96 \
 *     -e EVENT_ID=<active-event-id> \
 *     -e TOKENS_FILE=/scripts/load-test-tokens.json \
 *     grafana/k6 run /scripts/safety-report-burst.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { parseTokens, tokenForVu, bearerHeader } from './lib/accounts.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const EVENT_ID = __ENV.EVENT_ID || '';
const TOKENS_FILE = __ENV.TOKENS_FILE || '/scripts/load-test-tokens.json';
const PEAK_VUS = parseInt(__ENV.PEAK_VUS || '6767', 10);

// open() must be called in the init stage (global scope), not inside setup()
const _rawTokens = open(TOKENS_FILE);

const accepted = new Counter('reports_accepted_202');
const rejected = new Counter('reports_rejected_non_202');
const latency = new Trend('report_latency_ms', true);

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 2000 },   // 暖機：漸增至 2000 VU
        { duration: '3m', target: PEAK_VUS }, // 拉升：至 6767 VU
        { duration: '2m', target: PEAK_VUS }, // 持續：維持峰值
        { duration: '1m', target: 0 },        // 冷卻
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    reports_accepted_202: ['count>=6000'],             // 大多數應成功
    'http_req_failed{name:submit}': ['rate<0.10'],     // 失敗率 < 10%（允許少量 429）
    'http_req_duration{name:submit}': ['p(95)<800'],   // p95 < 800ms
  },
};

export function setup() {
  if (!EVENT_ID) {
    throw new Error('EVENT_ID env var is required. Set an ACTIVE event ID.');
  }
  const tokens = parseTokens(_rawTokens);
  console.log(`Loaded ${tokens.length} tokens for ${PEAK_VUS} VUs.`);
  return { tokens };
}

export default function (data) {
  // Each VU gets its own token — no rate-limit collision between users
  const account = tokenForVu(data.tokens, __VU);

  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/reports`;
  const payload = JSON.stringify({
    status: Math.random() < 0.9 ? 'SAFE' : 'NEED_HELP',
    message: 'k6 burst test',
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearerHeader(account),
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

  if (ok) {
    accepted.add(1);
  } else {
    rejected.add(1);
  }
}
