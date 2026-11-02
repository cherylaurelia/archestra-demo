# fix(sandbox): key each sandbox's layer chain on its sandbox id (#8662)

Fixes #8662, reported by @kundeng, who measured it and traced the cause to `materialize`. This PR implements the first fix they suggested (a per-sandbox value at the root of the chain) and adds the regression test they described.

## Problem
`materialize` builds each call as warm base → one `with_exec` per replayed command → the live exec. Nothing in that chain identifies the sandbox, so Dagger's content-addressed cache treats two sandboxes with equal history as the same computation. Two fresh sandboxes are the common case: the first command alone decides the match, and the second sandbox (including another user's) gets the first one's result without running anything.

Reproduced on main (704de1e) through `sandbox_core::run_sandbox` with a real Dagger 0.21.9 engine (same pinned engine digest as `on-pull-requests-dagger-sdk.yml`):

```
assertion `left != right` failed: sandbox b was served sandbox a's cached result
  left: "13:02:30.360330216"
 right: "13:02:30.360330216"
```

(Timestamps differ per run; the explainer page shows a separate run of the same test.)

## Change
- `sandbox-core`: `RunSandboxInput` and `ReadArtifactInput` get an optional `sandboxKey`, validated at the boundary (1–128 bytes, `[A-Za-z0-9_-]`). `materialize` roots the chain in `keyed_base`, which sets `ARCHESTRA_SANDBOX_KEY=<key>` on the warm container before any replay step.
- Env vars are part of every later exec's cache key, so:
  - two sandboxes never share a layer or a result;
  - a sandbox's own replay still hits its own cached layers (no re-execution, same cost as today);
  - history only grows (every run is appended, failures and synthetic engine-failure rows included), so each live command runs once per sandbox and history position.
- `SkillSandboxRuntimeService` passes `sandboxId` as the key for both `runCommand` and `readArtifact`, so artifact reads replay onto the same cached layers the commands produced.
- `index.d.ts` updated; matches `napi build` output byte for byte.

### Why the sandbox id
`skill_sandbox.id` is `uuid().primaryKey().defaultRandom()`: never reused, and a sandbox belongs to one conversation (or one org/user/app). A user or session id would be wrong in both directions: one user's sandboxes would still share results with each other, and a sandbox resumed in a new session would lose its cache.

### Why an env var
`ARCHESTRA_SANDBOX_KEY` is visible to commands inside the sandbox. It holds the sandbox's own id, which is not a secret and grants nothing by itself. I looked at `with_label` instead, but labels are image config and don't enter the exec cache key, so they wouldn't fix this. A no-op `with_exec` would add an overlay layer to every sandbox and count against `MAX_REPLAY_FS_LAYERS`. The env var adds no filesystem layer.

## Tests
- New `sandbox-core/tests/live_sandbox_isolation.rs` (opt-in with `ARCHESTRA_SANDBOX_LIVE_TESTS=1`, like `live_secret_env.rs`):
  - `sandboxes_with_equal_history_do_not_share_live_results`: two sandboxes, empty history and then one equal replayed command, `date -u +%T.%N`; the outputs must differ. **Fails on main, passes with this change.**
  - `a_sandbox_replay_stays_cached_and_keeps_its_state`: a command writes a timestamp to a file; replaying it in the same sandbox must not run it again (the file keeps the live value). Passes before and after, so the change keeps replay caching.
- Unit tests for `validate_sandbox_key`.
- Ran locally: `cargo fmt`, `cargo check`, `cargo clippy --all-targets -- -D warnings` for `sandbox_core` (default and `napi` features) and `sandbox_rs` (clean; the only warning is the existing one in the vendored dagger-sdk), `biome check` on the two TS files, `cargo test -p sandbox_core` (all pass), the three live tests against Dagger 0.21.9, `tsc --noEmit` in `backend/`, and `vitest run` for `sandbox-runtime-service.test.ts` and `skill-sandbox-runtime-service.test.ts` (37 passed).

## Known cost and limits
- **`sandboxKey` is optional** so `helper-bridge` and any one-off caller keep working unchanged. The catch is that a new sandbox-backed caller is unkeyed by default. If you'd prefer, I can make it required on `SandboxRuntimeService.runCommand` / `readArtifact` and pass an explicit `null` from the helper bridge.
- **One-time cold cache on deploy.** Every existing sandbox's chain changes, so its next call replays its full history once, the same as after an engine restart or cache prune today. That is O(history) per active sandbox, once. It also means the existing cold-cache behaviour from the issue (replayed commands with side effects run again) happens once for each active sandbox. This PR doesn't change that behaviour; it only keeps it from being triggered across sandboxes.
- **Different engine or restart:** still correct. The key only scopes the cache, so a replay on a cold engine rebuilds the same state as before (cold-cache cost only).
- **OpenAPPA helper consults (`openappa/helper-bridge.ts`) are left unkeyed on purpose.** They have no sandbox: each consult is a single exec on top of a skill mount, with the request as stdin, so the exec definition already includes the request. Whether two installs with identical battery files and identical requests should share a cached answer is a product decision (credentials ride as secrets, and I didn't verify whether Dagger secret values enter the cache key). If you want them isolated, passing `install.id` as `sandboxKey` there is a one-line follow-up.
- **Not verified:** the egress-proxy effect from the issue (cached network commands never reach the proxy). It follows from the cause and should be fixed by this change across sandboxes, but I didn't run the egress proxy.
- Not in this PR: the issue's second suggestion (never serve the live command from cache). With per-sandbox keys a live command can only hit cache if the same sandbox repeats the same history position. The append-only log normally prevents that; the exception is when the replay-event insert itself fails after a successful run (the error is logged and the row is lost), where an identical retry would be served from cache. That path is rare and pre-existing, so I left it alone.
