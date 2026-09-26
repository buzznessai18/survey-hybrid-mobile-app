# Field Survey — Mobile App

This is the Expo (SDK 57) and React Native (0.86) app.
- **Anyone:** opens the app and **directly** searches, views and maps all surveys. There's no login; farmer mobiles are masked.
- **Admin:** signs in from **Profile → Admin Login** to add and edit surveys (GPS, photo, duplicate check, offline queue) and manage admins. Logging out returns to browsing.

It uses the existing Supabase backend in `../supabase`, calling the real Edge Functions and Storage. No API is mocked.

## Backend

The app talks to the **cloud Supabase project `lmtshyxsuejzffjumyrq`**, where the 11 migrations and 10 Edge Functions are deployed. Its public URL and anon key are in:
- `eas.json` (`build.base.env`), for APK builds
- `.env`, for local development

To point at another backend (e.g. the local stack), change `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in both places.

Cloud auth settings:
- Public signup is **disabled**.
- Email + password and **mobile number + password** logins are enabled. No SMS is sent; OTP is not used.
- Accounts are created by an admin through the `admin-users` Edge Function.

## Maps

Maps use **MapLibre** (`@maplibre/maplibre-react-native`) with free OpenStreetMap vector tiles from OpenFreeMap. There is **no Google Maps API key**. Tiles need internet, but GPS capture works offline.

## Build & share the APK (EAS)

```bash
npx eas-cli@latest build -p android --profile preview      # installable .apk to share
npx eas-cli@latest build -p android --profile development  # dev client for day-to-day development
npx eas-cli@latest build -p android --profile production   # .aab for Google Play
```

- The EAS project is `@afshanakd/field-survey`.
- The Android signing keystore is generated and stored by EAS. **Keep using the same EAS project**, so updates install over the previous APK.
- Increase `version` in `app.config.ts` for each release you share. `versionCode` is auto-managed.

### Development
MapLibre is a native module and is **not included in Expo Go**. Develop with the dev-client APK instead:
1. Install the `development` build once.
2. Run `npx expo start --dev-client`.
3. Scan the QR code, or with USB connected run `adb reverse tcp:8081 tcp:8081` and open the app.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit` (strict, with typed routes) |
| `npm run lint` | `expo lint` (includes the React Compiler rules) |
| `npm test` | Unit tests (56): validation, serialization, duplicate interpretation, error mapping, sync state machine and idempotency, auth store |
| `npm run test:integration` | Contract test (14): runs the app's real service layer against a live backend. Needs env vars; see below |
| `npm run doctor` | `expo-doctor` |

Running the contract test against the local stack:
```bash
eval "$(cd .. && supabase status -o env)"
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
INTEGRATION_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" npm run test:integration
```
The service key is used **only by the test process** to provision a throwaway user. It is never bundled into the app.

## Structure

```
src/
  app/                      Expo Router routes (screens only)
    (auth)/login            (tabs)/{index,surveys,map,profile}
    survey/new/{details,location,photo,review,duplicate,reason,success}
    survey/[id]             survey/edit/[id]
    profile/{details,offline,settings,help,about}
  components/{ui,forms,survey,map}   reusable UI (no API calls)
  features/                 hooks that connect screens to services and stores
  services/                 api (function client + errors), auth, surveys, storage, location, sync, map, crops, reports
  store/                    Zustand: auth, draft, queue (outbox), sync, network, cache, settings
  types/                    api.ts mirrors the Edge Function contracts; survey.ts holds local models
  utils/                    validation (zod), serialization, date/format, status, duplicate
```

UI components never call Supabase directly. All reads and writes go through `services/*`, and every write goes through an Edge Function. The one exception is two direct table reads that RLS permits: the user's own `profiles` row and the active `crops` list.

## Offline sync

- **Survey id.** When a survey is started, the phone generates a UUID. It is the survey's id on the server, the create-survey idempotency key, and the photo folder name (`{user_id}/{survey_id}/field-photo.jpg`).
- **Submitting** freezes the draft into a persisted outbox item and moves it through `pending_sync` → `syncing` → `synced` / `sync_failed`.
  - Offline, the item simply waits in the queue.
  - The photo is uploaded once (with upsert), and its path is remembered so retries don't upload it again.
  - The survey is marked `synced` only after `create-survey` confirms. A retry after a lost response returns `idempotent_replay: true` with the same survey; no duplicate record is created.
- **Error handling:**
  - Network or timeout: stays pending and doesn't count as a retry.
  - 5xx or 429: exponential back-off (30 s up to 30 min), then `sync_failed` after 5 attempts.
  - 422 or 409: `sync_failed` with the field errors, and **Edit & Resubmit** reuses the same id.
  - 401: waits until the user signs in again.
- **Sync triggers:** reconnecting, the app returning to the foreground, signing in, a 60 s timer (which respects back-off), and **Sync Now**.
- **Surviving restarts:** a sync interrupted by the app being killed is recovered on the next launch. Drafts are persisted, so a crash doesn't lose field work.

## Integration notes

1. **Mobile-number login.** It's enabled on the cloud project (Phone provider on, password login, no SMS). On the *local* stack it's still off (`[auth.sms] enable_signup = false` in `supabase/config.toml`).
2. **No password reset.** The backend has no reset flow, so the login screen tells users to contact their administrator.
3. **The backend test suite doesn't re-run cleanly.** `tests/api.test.ts` inserts a fixed farmer, so a second run on the same database fails that one test. It's a test-only issue, not a backend bug.
4. **npm peer dependencies.** `.npmrc` sets `legacy-peer-deps=true`, because an optional `react-dom` peer in Expo SDK 57 packages conflicts with React Native's React version. EAS Build uses the same setting.
