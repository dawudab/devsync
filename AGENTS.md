# DevSync agent notes

## Commands
- Dev server: `npm run dev` (Demo Mode when `.env` has no `VITE_FIREBASE_*` keys)
- Verify frontend: `npm run lint && npm run build`
- Functions unit tests: `npm run test:functions` (runs `node --test` in `functions/`)
- Firestore rules tests: `npm run test:rules` (needs Java 21+ for the emulator)

## Conventions
- `/shared/*.js` is the single source of truth for translator + GitHub normalizer; after edits run
  `npm --prefix functions run sync-shared` (copies into `functions/src/shared/`).
- Both backends in `src/lib/data/` (`firestoreBackend.js`, `localBackend.js`) must implement the same contract
  documented in `src/lib/data/index.js`.
- lucide-react 1.x has no brand icons; use `src/components/ui/GithubIcon.jsx`.
- React Compiler lint rules are on: no `Date.now()` during render (use `useNow()`).
- Install npm deps with `--before=<date 7+ days ago>` to avoid freshly published versions.
