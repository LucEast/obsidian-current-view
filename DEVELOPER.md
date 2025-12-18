# Developer Guide

## Local Setup
- Install dependencies: `npm install`.
- Development build: `npm run dev` (esbuild watch → outputs `main.js` for a test vault).
- Linting is not configured; rely on TypeScript and tests for feedback.

## Testing
- Unit tests use Vitest. Commands:
  - `npm run test` – run all specs once.
  - `npm run test:watch` – watch mode while iterating.
  - `npm run coverage` – V8 coverage (text + lcov).
- Tests live in `__tests__/`; shared helpers and Obsidian stubs in `__mocks__/obsidian.ts`.
- Prefer pure helpers in `view-mode.ts` for logic; keep Obsidian integration in `main.ts` thin so it can be exercised via mocks if needed.
- TypeScript build excludes tests/mocks; Vitest uses `tsconfig.vitest.json` for globals/types.

## Adding Tests
- Mirror scenarios: folder vs. file-pattern priority, frontmatter fallback, debounce/ignore flags, and default view mode behavior.
- For Obsidian-specific flows, extend the mock classes minimally to cover the behavior under test instead of coupling to real APIs.
- When adding new config parsing or rule types, add a helper function (pure) and cover it in `__tests__`.

## Build & Release
- Production build: `npm run build` (tsc type-check + esbuild production bundle).
- Release workflow (`.github/workflows/release.yml`) installs with `npm ci`, runs tests, then builds before semantic-release.

## Contribution Tips
- Use conventional commits (e.g., `fix:`, `feat:`, `chore:`). For tests-only changes, `test:` is fine.
- Keep PRs small: describe behavioral changes and list manual test steps (especially settings UI changes).
- If you touch dependency versions or build tooling, run `npm run test` and `npm run build` locally before opening a PR.
