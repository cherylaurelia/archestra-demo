# Archestra #8662: per-sandbox cache keys for the Code Sandbox (unofficial demo)

**Problem.** In Archestra's Code Sandbox, `run_command` could return a cached result instead of running:
`materialize` (`platform/archestra-rs/sandbox-core/src/backends/dagger.rs`) builds each call as warm base →
replayed commands → live command, and nothing in that chain identifies the sandbox, so Dagger's
content-addressed cache treated two sandboxes with equal history as the same computation.
Reported with measurements by @kundeng: https://github.com/archestra-ai/archestra/issues/8662

**Fix.** Root each sandbox's chain in `ARCHESTRA_SANDBOX_KEY=<sandbox id>`. Results stay per sandbox; a
sandbox's own replay still hits its cached layers. Branch: https://github.com/archestra-ai/archestra/pull/10061
(PR description in `public/PR.md`).

**This page** shows the real output of the regression test `sandbox-core/tests/live_sandbox_isolation.rs`
run through `sandbox_core::run_sandbox` against a Dagger 0.21.9 engine on 2026-11-01, before (main @ 704de1e)
and after the change (values in `app/runs.ts`).

## Run
```
npm install
npm run dev   # http://localhost:3000
```

Unofficial demo by Cheryl Aurelia: not affiliated with Archestra.
