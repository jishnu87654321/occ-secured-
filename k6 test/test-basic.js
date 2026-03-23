import http from 'k6/http';
import { sleep, check } from 'k6';

const BASE_URL = __ENV.OCC_BASE_URL;

export function setup() {
  const res = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email:    __ENV.OCC_EMAIL,
      password: __ENV.OCC_PASSWORD
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  console.log('Login status:', res.status);
  console.log('Login body:', res.body);

  const token = res.json('data.accessToken')
             || res.json('data.token')
             || res.json('accessToken')
             || res.json('token');

  console.log('Token found:', token ? 'YES' : 'NO');
  return { token };
}

export const options = { vus: 10, duration: '30s' };

export default function (data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json'
  };

  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health OK': (r) => r.status === 200 });

  const posts = http.get(`${BASE_URL}/api/posts`, { headers });
  check(posts, { 'posts loaded': (r) => r.status === 200 });

  sleep(1);
}