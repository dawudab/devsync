/**
 * Minimal, dependency-free GitHub App client:
 * - webhook signature verification (HMAC-SHA256, constant-time)
 * - App JWT signing (RS256) and short-lived installation access tokens (cached in memory, never persisted)
 * - OAuth code exchange used to prove the installing user actually has access to an installation
 * - signed, expiring `state` tokens that bind an install flow to a workspace + user
 */
import crypto from 'node:crypto';

const API = 'https://api.github.com';
const HEADERS = { 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'DevSync-GitHub-App' };

export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !secret || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

const b64url = (input) => Buffer.from(input).toString('base64url');
const normalizeKey = (key) => key.replace(/\\n/g, '\n');

export function createAppJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: String(appId) }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(normalizeKey(privateKey), 'base64url');
  return `${header}.${payload}.${signature}`;
}

async function gh(path, { token, method = 'GET', body, tokenType = 'Bearer' } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      ...HEADERS,
      Accept: 'application/vnd.github+json',
      ...(token && { Authorization: `${tokenType} ${token}` }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path} failed with ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const tokenCache = new Map();

export function createGitHubApp({ appId, privateKey }) {
  const appJwt = () => createAppJwt(appId, privateKey);

  async function installationToken(installationId) {
    const cached = tokenCache.get(installationId);
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const data = await gh(`/app/installations/${installationId}/access_tokens`, { token: appJwt(), method: 'POST' });
    tokenCache.set(installationId, { token: data.token, expiresAt: Date.parse(data.expires_at) });
    return data.token;
  }

  return {
    /** Verifies the installation belongs to this App (404 otherwise). */
    getInstallation: (installationId) => gh(`/app/installations/${installationId}`, { token: appJwt() }),

    async listInstallationRepos(installationId) {
      const token = await installationToken(installationId);
      const repos = [];
      for (let page = 1; page <= 5; page++) {
        const data = await gh(`/installation/repositories?per_page=100&page=${page}`, { token });
        repos.push(...data.repositories);
        if (data.repositories.length < 100) break;
      }
      return repos.map(toRepoMeta);
    },

    async request(installationId, path) {
      return gh(path, { token: await installationToken(installationId) });
    },
  };
}

export function toRepoMeta(r) {
  return { id: r.id, fullName: r.full_name, private: Boolean(r.private), defaultBranch: r.default_branch || 'main', htmlUrl: r.html_url };
}

export async function exchangeOAuthCode({ clientId, clientSecret, code }) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { ...HEADERS, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`OAuth exchange failed: ${data.error || res.status}`);
  return data.access_token;
}

/** True when the GitHub user behind `userToken` can access `installationId`. */
export async function userCanAccessInstallation(userToken, installationId) {
  for (let page = 1; page <= 5; page++) {
    const data = await gh(`/user/installations?per_page=100&page=${page}`, { token: userToken });
    if (data.installations.some((i) => String(i.id) === String(installationId))) return true;
    if (data.installations.length < 100) break;
  }
  return false;
}

export function signState(data, secret, ttlSeconds = 15 * 60) {
  const body = b64url(JSON.stringify({ ...data, exp: Date.now() + ttlSeconds * 1000, n: crypto.randomBytes(8).toString('hex') }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(body).digest('base64url'));
  const received = Buffer.from(sig || '');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
