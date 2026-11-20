# DevSync

A secure, mobile-first private workspace that connects business owners with their software developers.
DevSync listens to a private GitHub repository through a GitHub App, translates commits and pull requests into
plain-English summaries with AI, and gives both sides a place to react, discuss, and manage change requests.

- **The Feed**: real-time activity stream. Every push and merged PR becomes a card with a headline and three plain-language bullets (what changed, why it matters, whether it's live).
- **Reactions & threaded comments**: 👍 🚀 ❤️ 👀 on every update, plus one-level reply threads that sync in real time.
- **Requests**: owners file change requests (title, details, Low/Medium/High). Developers move them through `To Do → In Progress → Completed` and link the commit that delivered them.
- **Owner / Developer view switcher**: Owner View is simplified and non-technical. Developer View shows commit SHAs, branches, diff stats, webhook deliveries, an AI translator playground, and installation details.
- **Multi-tenant isolation**: each business is a `workspaceId`. Firestore rules, Cloud Functions, and frontend state are all scoped to it.

---

## Quick start (Demo Mode, no backend needed)

```bash
npm install
npm run dev
# open http://localhost:5173
```

With no Firebase keys in `.env`, the app runs in **Demo Mode**:

- Two seeded workspaces (*Acme Coffee Co.* and *Bloom & Petal Florist*) show tenant isolation.
- The **Owner/Dev** toggle also switches the signed-in persona (Sarah, the owner, or Alex, the developer), so comments and status changes are attributed correctly.
- Data lives in `localStorage` and syncs across tabs via `BroadcastChannel`. Open Owner View in one tab and Dev View in another to watch comments, reactions, and tickets update live.
- **Simulate webhook** (Dev View) generates a realistic GitHub delivery and runs it through the same normalizer and translator as production.
- **Settings → Install GitHub App** simulates the install flow and repository picker.
- **Settings → Reset demo data** restores the seed.

---

## Architecture

```
GitHub ──webhook──▶ /api/github/webhook  (githubWebhook)
                     │  HMAC-SHA256 verify → installation→workspace lookup → normalize
                     ▼
        workspaces/{ws}/webhookLogs/{deliveryId}  status: queued
                     │  Firestore trigger (processWebhookLog)
                     │  short-lived installation token → compare/PR files → diff excerpt
                     │  Gemini (JSON schema) → heuristic fallback
                     ▼
        workspaces/{ws}/updates/{deliveryId}  ──onSnapshot──▶  React feed (owner + dev)
```

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 3, lucide-react, react-router |
| Data / realtime | Cloud Firestore (`onSnapshot`), Firebase Auth (Google + anonymous guest) |
| Backend | Cloud Functions for Firebase v2 (Node 22, ESM): HTTP, callable, and Firestore-triggered |
| GitHub | GitHub App with webhooks, App JWT (RS256), installation tokens, and OAuth during install |
| AI | Gemini `generateContent` with `responseSchema`, plus a deterministic offline translator |

### Firestore data model

```
users/{uid}                              { workspaceIds[] }
installations/{installationId}           { workspaceId, account, linkedBy }    (server only)
workspaces/{wsId}                        { name, ownerId, members{uid:role}, profiles, inviteCode,
                                           ticketCounter, github{installationId, account, repos[],
                                           selectedRepo, status, connectedAt} }
  updates/{deliveryId}                   { kind, repo, branch, commits[], pr, stats, actor,
                                           summary{headline, bullets[3], impact, area, risk, source},
                                           reactions{emoji:[uid]}, commentCount, createdAt }
    comments/{id}                        { text, parentId, authorId, authorName, authorRole, createdAt }
  tickets/{id}                           { number, title, description, priority, status,
                                           createdBy, linkedCommit, activity[], createdAt, updatedAt }
  webhookLogs/{id}                       { event, action, deliveryId, status, message, durationMs, receivedAt }
```

### Security model

- **Tenant isolation**: every read requires `request.auth.uid in workspaces/{ws}.members`. There are no collection-group or cross-tenant queries. See `firestore.rules` and the test suite in `tests/firestore.rules.test.js`.
- **Server-only writes**: feed updates, webhook logs, installation mappings, and `workspace.github` are written only by Cloud Functions. Clients can only react, comment (as themselves, with their real role), and manage tickets (field-whitelisted).
- **Webhooks**: `X-Hub-Signature-256` is verified against the raw body with a constant-time compare before any processing. Deliveries are idempotent because the GitHub delivery ID is the document ID.
- **Installation linking** (`/api/github/setup`):
  1. `state` is an HMAC-signed, 15-minute token from `createInstallUrl`. It binds the workspace and the DevSync user, and only owners can mint one.
  2. The OAuth `code` returned during installation is exchanged for a user token. DevSync then checks `GET /user/installations` to confirm the installing GitHub user can actually access that installation. Without this check, someone could link another account's installation ID to their own workspace.
  3. The installation is verified with an App JWT. An installation already linked to another workspace is rejected.
- **Tokens**: installation tokens are minted on demand, kept only in memory, and never written to Firestore. The OAuth user token is used once and discarded.
- **Secrets**: private key, client secret, webhook secret, state secret, and Gemini key live in Cloud Secret Manager (`defineSecret`).

---

## Going live with Firebase

### 1. Firebase project

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # pick/create your project
```

In the Firebase console:
- Enable **Authentication** with the **Google** and **Anonymous** providers. Add your hosting domain to *Authorized domains*.
- Create a **Firestore** database (production mode).
- Upgrade to the **Blaze** plan (Cloud Functions and Secret Manager require it).
- Add a **Web app** and copy its config into `.env`:

```bash
cp .env.example .env
# fill VITE_FIREBASE_*  (these are public identifiers, not secrets)
```

### 2. Create the GitHub App

GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**

| Setting | Value |
|---|---|
| Homepage URL | `https://<your-app-domain>` |
| Callback URL | `https://<your-app-domain>/api/github/setup` |
| ✅ Request user authorization (OAuth) during installation | **enabled** (required for installation ownership verification) |
| Webhook URL | `https://<your-app-domain>/api/github/webhook` |
| Webhook secret | a long random string (`openssl rand -hex 32`) |
| Repository permissions | **Contents: Read-only**, **Metadata: Read-only**, **Pull requests: Read-only** |
| Subscribe to events | **Push**, **Pull request** (installation events are sent automatically) |
| Where can this be installed? | Any account |

Then generate a **private key** (.pem) and a **client secret**.

### 3. Configure Functions

```bash
cp functions/.env.example functions/.env      # GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_CLIENT_ID, APP_URL…
cd functions && npm install && cd ..

firebase functions:secrets:set GITHUB_PRIVATE_KEY < path/to/private-key.pem
firebase functions:secrets:set GITHUB_CLIENT_SECRET
firebase functions:secrets:set GITHUB_WEBHOOK_SECRET
firebase functions:secrets:set STATE_SECRET          # openssl rand -hex 32
firebase functions:secrets:set GEMINI_API_KEY        # from aistudio.google.com, or "disabled"
```

If `GEMINI_API_KEY` is `disabled`, or a Gemini call fails, the built-in heuristic translator is used, so the feed always works.

### 4. Deploy

```bash
npm run deploy        # vite build + firebase deploy (hosting, functions, firestore rules)
```

Firebase Hosting rewrites `/api/github/webhook` and `/api/github/setup` to the functions, so the GitHub App URLs above work on your hosting domain.

### Deploying the frontend to Vercel instead

`vercel.json` is included, so `vercel --prod` works. Add the `VITE_FIREBASE_*` variables in Vercel project settings. Functions still deploy to Firebase (`firebase deploy --only functions,firestore`). Point the GitHub App at the function URLs directly (`https://us-central1-<project>.cloudfunctions.net/githubWebhook` and `.../githubSetup`), set `APP_URL` to your Vercel domain, and add that domain to Firebase Auth's authorized domains.

---

## Local development against emulators

```bash
cp functions/.secret.local.example functions/.secret.local   # emulator-only secrets
echo "ALLOW_SIMULATION=true" >> functions/.env
# in .env: VITE_USE_EMULATORS=true and VITE_ENABLE_SIMULATOR=true (plus any VITE_FIREBASE_* values)
npm run emulators      # requires Java 21+
npm run dev
```

With `ALLOW_SIMULATION=true`, **Simulate webhook** sends fake deliveries through the real Firestore trigger pipeline, so you can test without GitHub. Keep it `false` in production.

To receive real GitHub webhooks locally, tunnel the functions emulator (for example with `ngrok http 5001`) and temporarily point the App's webhook URL at `https://<tunnel>/<project>/us-central1/githubWebhook`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint (React hooks rules included) |
| `npm run test:functions` | Unit tests: webhook HMAC, state tokens, App JWT, event normalizer, translator |
| `npm run test:rules` | Firestore security-rules tests against the emulator (requires Java 21+) |
| `npm run emulators` | Auth, Firestore, Functions, and Hosting emulators |
| `npm run deploy` | Build and deploy everything to Firebase |

---

## Project structure

```
devsync/
├── shared/                       # Pure modules shared by web app + Cloud Functions
│   ├── translator-core.js        #   heuristic translator, Gemini prompt/schema, output validation
│   ├── github-events.js          #   GitHub payload → normalized change → feed update doc
│   └── sample-events.js          #   realistic fake payloads (simulator + demo seed)
├── src/
│   ├── config/firebase.js        # Firebase init (+ emulator wiring); Demo Mode when unset
│   ├── lib/data/                 # Backend abstraction
│   │   ├── index.js              #   picks Firestore or Demo backend; documents the contract
│   │   ├── firestoreBackend.js   #   Firestore/Auth/callable implementation
│   │   ├── localBackend.js       #   Demo Mode implementation (same contract)
│   │   ├── localStore.js         #   localStorage doc store + BroadcastChannel realtime
│   │   └── demoSeed.js           #   seeded workspaces, updates, comments, tickets
│   ├── context/                  # Auth, Workspace (tenant + view mode), Toasts
│   ├── hooks/                    # useFeed/useComments/useTickets/useWebhookLogs, useAITranslator
│   ├── components/
│   │   ├── layout/               # AppShell, Header, BottomNav, ViewSwitcher, WorkspaceSwitcher
│   │   ├── feed/                 # FeedCard, AISummary, TechnicalDetails, ReactionBar, CommentThread
│   │   ├── tickets/              # TicketCard, NewTicketSheet, TicketDetailSheet (+ commit linking)
│   │   ├── dev/                  # WebhookLogList, TranslatorPlayground, SimulateEventButton
│   │   ├── settings/             # GitHubConnection (install → choose repo → connected)
│   │   └── ui/                   # Button, Sheet, Badge, Avatar, SegmentedControl, feedback states
│   └── pages/                    # Feed, Requests, Activity (webhooks), Settings, SignIn, Onboarding
├── functions/
│   ├── index.js                  # function exports
│   ├── src/config.js             # params & secrets
│   ├── src/github.js             # HMAC verify, App JWT, installation tokens, OAuth, state tokens
│   ├── src/webhook.js            # POST /api/github/webhook
│   ├── src/setup.js              # GET  /api/github/setup (install + OAuth callback)
│   ├── src/pipeline.js           # Firestore trigger: enrich → translate → write update
│   ├── src/translator.js         # Gemini client with heuristic fallback
│   ├── src/callables.js          # createInstallUrl, selectRepository, disconnectGithub,
│   │                             # joinWorkspace, retranslateUpdate, translatePreview, simulateEvent
│   ├── src/shared/               # copy of /shared (synced by `npm run sync-shared` / predeploy)
│   └── test/                     # node:test unit tests
├── tests/firestore.rules.test.js # security rules test suite
├── firestore.rules · firestore.indexes.json · firebase.json · vercel.json
└── tailwind.config.js · vite.config.js · eslint.config.js · postcss.config.js
```

## Notes & limitations

- After editing anything in `/shared`, run `npm --prefix functions run sync-shared`. It also runs automatically on deploy.
- Each workspace follows one repository. The installation can grant access to several repos, and the owner picks which one.
- Developers join with the workspace invite code (Settings → Team) and get the `developer` role.
- When diffs are enabled (`AI_INCLUDE_DIFFS=true`), truncated code diffs are sent to Gemini. Lockfiles and binaries are excluded. Set it to `false` to send only commit messages and file names.
