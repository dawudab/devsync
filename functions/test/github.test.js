import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature, signState, verifyState, createAppJwt } from '../src/github.js';
import { normalizeGithubEvent } from '../src/shared/github-events.js';
import { createSampleEvent } from '../src/shared/sample-events.js';
import { heuristicTranslate, coerceTranslation } from '../src/shared/translator-core.js';

const SECRET = 'test-secret';
const sign = (body, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

test('webhook signature: accepts valid, rejects tampered / wrong secret / missing', () => {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"hello":"w0rld"}'), sign(body), SECRET), false);
  assert.equal(verifyWebhookSignature(body, sign(body, 'other'), SECRET), false);
  assert.equal(verifyWebhookSignature(body, undefined, SECRET), false);
  assert.equal(verifyWebhookSignature(body, 'sha1=abc', SECRET), false);
  assert.equal(verifyWebhookSignature(body, sign(body), ''), false);
});

test('state token: round-trips, rejects tampering and expiry', () => {
  const token = signState({ ws: 'ws1', uid: 'u1' }, SECRET);
  assert.deepEqual({ ws: verifyState(token, SECRET).ws, uid: verifyState(token, SECRET).uid }, { ws: 'ws1', uid: 'u1' });
  assert.equal(verifyState(token, 'wrong'), null);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), ws: 'victim' })).toString('base64url');
  assert.equal(verifyState(`${forged}.${sig}`, SECRET), null);
  assert.equal(verifyState(signState({ ws: 'ws1', uid: 'u1' }, SECRET, -1), SECRET), null);
  assert.equal(verifyState('garbage', SECRET), null);
});

test('app JWT is RS256-signed and verifiable', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const jwt = createAppJwt(12345, pem.replace(/\n/g, '\\n'));
  const [h, p, s] = jwt.split('.');
  assert.equal(crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, s, 'base64url'), true);
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.iss, '12345');
  assert.ok(payload.exp - payload.iat <= 600);
});

test('normalizer: push, merged PR, and skipped events', () => {
  const repo = { fullName: 'acme/shop', id: 7 };
  const push = createSampleEvent(repo, 0);
  const { change } = normalizeGithubEvent(push.event, push.payload);
  assert.equal(change.kind, 'push');
  assert.equal(change.branch, 'main');
  assert.equal(change.commits.length, 1);

  const pr = createSampleEvent(repo, 1);
  assert.equal(normalizeGithubEvent(pr.event, pr.payload).change.kind, 'pull_request_merged');

  assert.ok(normalizeGithubEvent('push', { ...push.payload, ref: 'refs/tags/v1' }).skipReason);
  assert.ok(normalizeGithubEvent('push', { ...push.payload, commits: [] }).skipReason);
  assert.ok(normalizeGithubEvent('pull_request', { ...pr.payload, action: 'labeled' }).skipReason);
  assert.ok(normalizeGithubEvent('issues', {}).skipReason);
});

test('translator: spec example and model-output coercion', () => {
  const change = { kind: 'push', branch: 'main', defaultBranch: 'main', commits: [{ message: 'fix(auth): resolve JWT expiration bug in OAuth middleware' }], stats: {} };
  const out = heuristicTranslate(change);
  assert.equal(out.headline, 'We fixed an issue where customers were getting randomly logged out when trying to sign in.');
  assert.equal(out.bullets.length, 3);
  const coerced = coerceTranslation({ headline: 'Hi', bullets: ['one'], impact: 'bogus' }, change);
  assert.equal(coerced.bullets.length, 3);
  assert.equal(coerced.impact, 'fix');
  assert.equal(coerced.source, 'gemini');
});
