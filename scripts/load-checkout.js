import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Template load test checkout (PRD §11). Jalankan pada environment uji dengan
 * rate limit dinaikkan (settings: ratelimit.holds_per_ip_per_hour dll), dan
 * gateway mock agar pembayaran tidak menahan slot.
 *
 *   k6 run -e BASE=https://api.staging.example.id scripts/load-checkout.js
 *
 * Skenario: tiap VU memilih tanggal dengan sisa porsi, membuat sesi, memecahkan
 * CAPTCHA, lalu membuat order dengan Idempotency-Key unik. Semua kegagalan
 * kapasitas dianggap sah (CAPACITY_FULL), yang tidak sah adalah 5xx atau
 * reserved melebihi kapasitas — verifikasi terakhir lewat SQL setelah tes.
 */
export const options = {
  scenarios: {
    checkout: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '10s', target: 120 },
        { duration: '50s', target: 120 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

const BASE = __ENV.BASE;
if (!BASE) fail('Set -e BASE=https://api...');

function json(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

export default function () {
  const availability = http.get(`${BASE}/api/v1/availability?days=7`);
  if (!check(availability, { 'availability 200': (r) => r.status === 200 })) return;
  const days = json(availability).data.days.filter(
    (day) => !day.cutoffPassed && day.isOpen && day.remainingRegular >= 50,
  );
  if (days.length === 0) return;
  const day = days[Math.floor(Math.random() * days.length)];

  const phone = `0812${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const session = http.post(
    `${BASE}/api/v1/sessions`,
    JSON.stringify({ name: 'Load Test', phone, consent: true }),
    { headers: { 'content-type': 'application/json' } },
  );
  if (!check(session, { 'session 201': (r) => r.status === 201 })) return;
  const cookies = session.cookies;
  const cookieHeader = Object.keys(cookies)
    .map((name) => `${name}=${cookies[name][0].value}`)
    .join('; ');

  const captcha = http.post(`${BASE}/api/v1/captcha`, '{}', {
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
  });
  if (!check(captcha, { 'captcha 201': (r) => r.status === 201 })) return;
  const challenge = json(captcha).data;
  const numbers = (challenge.question.match(/\d+/g) || []).map(Number);
  const answer = challenge.question.includes('×') ? numbers[0] * numbers[1] : numbers[0] + numbers[1];

  const menu = http.get(`${BASE}/api/v1/menu?date=${day.date}`);
  if (!check(menu, { 'menu 200': (r) => r.status === 200 })) return;
  const item = json(menu).data.items[0];
  if (!item) return;

  const idempotencyKey = `${__VU}-${__ITER}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const order = http.post(
    `${BASE}/api/v1/orders`,
    JSON.stringify({
      serviceDate: day.date,
      items: [{ menuItemId: item.id, portions: 50 }],
      delivery: {
        address: { line: 'Jl. Load Test No. 1', district: 'Pontianak Kota' },
      },
      paymentMethod: 'qris',
      captchaToken: `${challenge.challengeId}.${answer}`,
      consent: true,
    }),
    {
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        'idempotency-key': idempotencyKey,
      },
    },
  );

  // 201 sukses, 422/429/403 kapasitas/rate limit — keduanya bukan kegagalan server.
  check(order, {
    'order tidak 5xx': (r) => r.status < 500,
  });
}
