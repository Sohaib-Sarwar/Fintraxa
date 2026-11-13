# Fintraxa mobile (Android first)

Expo SDK 58 · React Native 0.88 · Expo Router · TypeScript strict · runs in **Expo Go**.
Same Supabase backend and the **same money engines** as the web app (`../src/lib`, imported via `@core/*`).

- Plan, status and decisions: `../docs/mobile/MOBILE_APP_PLAN.md` (§14 tracker, §15 deviations)
- Phone setup and Expo Go steps: `../docs/mobile/DEVICE_SETUP.md`
- Code map and gotchas: `../CONTEXT.md` §15
- Design references: `../docs/mobile/design-references.md`

```bash
npm install
npx expo start          # scan the QR with Expo Go (--tunnel if the Wi-Fi blocks it)
npm test                # jest-expo
npx tsc --noEmit        # typecheck
npx eslint .            # lint (React Compiler rules on)
```

Rules that matter here: money through decimal.js (`src/lib/format.ts`, the engines); never print or log tokens,
amounts or emails; reads go through `src/data/queries.ts`, writes through `src/data/mutations.ts`; icons only via
`@/ui/icons`; every change updates `../CONTEXT.md`.
