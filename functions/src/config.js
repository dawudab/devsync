import { setGlobalOptions } from 'firebase-functions/v2';
import { defineBoolean, defineSecret, defineString } from 'firebase-functions/params';

setGlobalOptions({ region: 'us-central1', maxInstances: 20 });

// Plain parameters (functions/.env or prompted at deploy time)
export const GITHUB_APP_ID = defineString('GITHUB_APP_ID', { description: 'Numeric GitHub App ID' });
export const GITHUB_APP_SLUG = defineString('GITHUB_APP_SLUG', { description: 'GitHub App slug, as in github.com/apps/<slug>' });
export const GITHUB_CLIENT_ID = defineString('GITHUB_CLIENT_ID', { description: 'GitHub App OAuth client ID' });
export const APP_URL = defineString('APP_URL', { default: 'http://localhost:5173', description: 'Public URL of the DevSync web app' });
export const GEMINI_MODEL = defineString('GEMINI_MODEL', { default: 'gemini-2.5-flash' });
export const ALLOW_SIMULATION = defineBoolean('ALLOW_SIMULATION', { default: false });
export const AI_INCLUDE_DIFFS = defineBoolean('AI_INCLUDE_DIFFS', { default: true });

// Secrets (Cloud Secret Manager; functions/.secret.local for the emulator)
export const GITHUB_PRIVATE_KEY = defineSecret('GITHUB_PRIVATE_KEY');
export const GITHUB_CLIENT_SECRET = defineSecret('GITHUB_CLIENT_SECRET');
export const GITHUB_WEBHOOK_SECRET = defineSecret('GITHUB_WEBHOOK_SECRET');
export const STATE_SECRET = defineSecret('STATE_SECRET');
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
