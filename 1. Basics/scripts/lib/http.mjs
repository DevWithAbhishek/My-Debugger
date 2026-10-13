// Tiny fetch helpers shared by the local reproduction scripts. Node >= 20.
export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
export const DEMO_PASSWORD = 'Passw0rd!demo'; // fictional fixture credential

export async function call(method, path, { token, body, timeoutMs = 4000 } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text, requestId: res.headers.get('x-request-id') };
  } catch (err) {
    return { status: 0, error: err.cause?.code ?? err.message };
  }
}

export async function login(email) {
  const r = await call('POST', '/api/v1/auth/login', { body: { email, password: DEMO_PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${r.text ?? r.error}`);
  return r.json;
}

export const short = (r) =>
  r.status === 0 ? `no response (${r.error})` : `${r.status} ${(r.text ?? '').replace(/\s+/g, ' ').slice(0, 140)}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exit with a helpful message when the API is not running. */
export async function requireApi() {
  const r = await call('GET', '/healthz');
  if (r.status === 0) {
    console.error(`The API is not reachable at ${BASE} (${r.error}). Start it first with \`npm start\` in another terminal.`);
    process.exit(2);
  }
}
