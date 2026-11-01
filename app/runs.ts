// Real outputs of sandbox-core/tests/live_sandbox_isolation.rs, 2026-11-01,
// Dagger 0.21.9 engine. Raw logs: data/research/archestra/repro-{before,after}.txt
export const MAIN_SHA = "704de1e";

export const BEFORE = [
  { label: "two fresh sandboxes", a: "14:24:29.117582103", b: "14:24:29.117582103" },
];

export const AFTER = [
  { label: "two fresh sandboxes", a: "14:24:20.614234971", b: "14:24:20.664516905" },
  { label: "same replayed history", a: "14:24:20.753641879", b: "14:24:20.842553842" },
];
