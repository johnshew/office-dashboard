# Development

Follow [repository freshness and instruction maintenance](workflow.md) at the
start of work, after long-running changes and before any authorized publication.
Update the owning guide when behavior or setup changes; do not duplicate policy
across tool adapters.

## Runtime and dependencies

- Use Node 24 LTS; `package.json` requires at least Node 22.12. Follow
  [setup](setup.md) before installing a duplicate runtime.
- Use `npm ci` to restore the committed dependency graph. When intentionally
  changing a dependency, use npm to update both manifests and inspect the diff.
  Do not manually reconstruct `package-lock.json`.
- `npm start` serves local development at `http://localhost:8000/`.
  `npm run build` type-checks and builds `dist/`; `npm run preview` serves a build.
- Copy `.env.example` to a local `.env` and set public identity configuration.
  `VITE_` values are public bundle contents, never secret storage.

## Code boundaries

`samples/tesla/App.tsx` coordinates state and UI; `samples/tesla/Identity.ts`
handles identity and Graph transport. Components in `src/` render Graph data.
`samples/tesla/dashboard.css` owns the responsive mail layout. `server.js` is
the optional device-code backend, not the static production web server.

Keep authentication and backend modes explicit. Reuse helpers rather than
duplicating request validation, cancellation or session management.
Preserve Calendar's separate scrolling option and Mail's independent reader/list.

## Tesla baseline

The historical Intel MCU2 reference is Intel Atom E8000-series, Linux x86_64,
Chromium **88.0.4324.150**. It is not the measured current version of the owner's car.
Record actual model, hardware, firmware and full user agent during acceptance.
Do not infer browser support from the car's Bluetooth audio or modern desktop tests.

Treat cross-device passkey QR as unavailable for this Tesla target. Phone-local
authentication in Node device-code or Phone Link is a separate capability.
The candidate build targets Chrome 88 and uses a shared request timeout helper;
Chromium 88 lacks `AbortSignal.timeout()`. Generated code and runtime behavior
still need real vehicle acceptance. Never weaken HTTPS, PKCE, token
isolation or the mail sandbox to make an older browser load.

See [testing](testing.md) for validation and
[authentication and security](authentication-security.md) for identity changes.
