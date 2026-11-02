import { AFTER, BEFORE, MAIN_SHA } from "./runs";

const ISSUE = "https://github.com/archestra-ai/archestra/issues/8662";
const SRC = `https://github.com/archestra-ai/archestra/blob/${MAIN_SHA}/platform/archestra-rs/sandbox-core/src/backends/dagger.rs`;
const BRANCH = "https://github.com/archestra-ai/archestra/pull/10061";
const REPO = "https://github.com/cherylaurelia/archestra-demo";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary-dark">
      {children}
    </p>
  );
}

type Run = { label: string; a: string; b: string };

function Terminal({ title, tone, runs }: { title: string; tone: "bad" | "good"; runs: Run[] }) {
  const badge =
    tone === "bad"
      ? "bg-[#fef3f2] text-bad ring-[#fecdca]"
      : "bg-[#f0fdfa] text-good ring-[#99f6e4]";

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <figcaption className="flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ${badge}`}>
          {tone === "bad" ? "same result" : "each sandbox runs"}
        </span>
      </figcaption>
      <div className="overflow-x-auto bg-code px-4 py-4 font-mono text-[12.5px] leading-6 text-[#e6edf3]">
        <p className="text-[#8b949e]">$ run_command &apos;date -u +%T.%N&apos;</p>
        {runs.map((r) => (
          <div key={r.label} className="mt-2">
            <p className="text-[#8b949e]"># {r.label}</p>
            <p>
              <span className="text-[#7ee2d6]">sandbox A</span> → {r.a}
            </p>
            <p>
              <span className="text-[#f0b3a8]">sandbox B</span> → {r.b}
              {r.a === r.b ? <span className="text-[#f0b3a8]">  (never ran)</span> : null}
            </p>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Chain({ keyed }: { keyed: boolean }) {
  const steps = keyed
    ? ["warm base", "ARCHESTRA_SANDBOX_KEY=<sandbox id>", "replayed commands…", "live command"]
    : ["warm base", "replayed commands…", "live command"];

  return (
    <ol className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`rounded-md border px-2 py-1 ${
              s.startsWith("ARCHESTRA")
                ? "border-primary bg-[#f0fdfa] text-primary-dark"
                : "border-line bg-white text-foreground"
            }`}
          >
            {s}
          </span>
          {i < steps.length - 1 ? <span aria-hidden className="text-muted">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

const DIFF = `-    let mut container = warm;
+    let mut container = keyed_base(warm, req.sandbox_key.as_deref());

+fn keyed_base(warm: Container, sandbox_key: Option<&str>) -> Container {
+    match sandbox_key {
+        Some(key) => warm.with_env_variable(SANDBOX_KEY_ENV, key),
+        None => warm,
+    }
+}`;

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 pt-14 sm:px-8">
      <header className="text-center">
        <Eyebrow>archestra #8662 · code sandbox</Eyebrow>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl">
          Two sandboxes, one cached result.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          <span className="text-foreground">Problem:</span> the Dagger cache keys for{" "}
          <code className="font-mono text-[0.9em]">run_command</code> didn&apos;t include the sandbox, so
          sandboxes with the same history got the first one&apos;s output instead of running.{" "}
          <span className="text-foreground">Fix:</span> start each sandbox&apos;s layer chain with its id, so
          results stay per sandbox and replay stays cached.
        </p>
        <p className="mt-4 text-sm text-muted">
          Reported with measurements by{" "}
          <a className="font-semibold text-primary-dark underline-offset-2 hover:underline" href={ISSUE}>
            @kundeng in #8662
          </a>
          . Reproduced on main ({MAIN_SHA}) with a real Dagger 0.21.9 engine.
        </p>
      </header>

      <section className="mt-12 grid gap-5 md:grid-cols-2" aria-label="Before and after">
        <div className="min-w-0">
          <h2 className="mb-2 text-sm font-semibold text-ink">Before · main</h2>
          <Terminal title="sandbox-core on main" tone="bad" runs={BEFORE} />
        </div>
        <div className="min-w-0">
          <h2 className="mb-2 text-sm font-semibold text-ink">After · fix/sandbox-cache-isolation</h2>
          <Terminal title="with per-sandbox key" tone="good" runs={AFTER} />
        </div>
      </section>
      <p className="mt-3 text-center text-xs text-muted">
        Output of <code className="font-mono">tests/live_sandbox_isolation.rs</code> through{" "}
        <code className="font-mono">sandbox_core::run_sandbox</code>, run 2026-11-01. Not a mock. On main the
        test stops at its first assertion, so the equal-history case only appears on the right.
      </p>

      <section className="mt-14 grid gap-8 md:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <Eyebrow>why it happened</Eyebrow>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink">The chain had no sandbox in it</h2>
          <p className="mt-3 leading-relaxed text-muted">
            <a className="text-primary-dark underline-offset-2 hover:underline" href={SRC}>
              <code className="font-mono text-[0.9em]">materialize</code>
            </a>{" "}
            rebuilds every call from the warm base plus each replayed command. Dagger&apos;s cache is
            content-addressed, so equal histories became the same computation. Two fresh sandboxes have
            equal (empty) histories.
          </p>
          <div className="mt-5 space-y-3 rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Before</p>
            <Chain keyed={false} />
            <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">After</p>
            <Chain keyed />
          </div>
        </div>
        <div className="min-w-0">
          <Eyebrow>the change</Eyebrow>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink">One env var at the root</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-code p-4 font-mono text-[12.5px] leading-6 text-[#e6edf3]">
            {DIFF.split("\n").map((line, i) => (
              <span
                key={i}
                className={
                  line.startsWith("+") ? "block text-[#7ee2d6]" : line.startsWith("-") ? "block text-[#f0b3a8]" : "block"
                }
              >
                {line || " "}
              </span>
            ))}
          </pre>
          <ul className="mt-4 space-y-2 text-[15px] leading-relaxed text-muted">
            <li>
              <span className="font-semibold text-foreground">Keyed on the sandbox id</span>: a random UUID primary
              key, never reused. Passed for both <code className="font-mono text-[0.9em]">runCommand</code> and{" "}
              <code className="font-mono text-[0.9em]">readArtifact</code>.
            </li>
            <li>
              <span className="font-semibold text-foreground">Replay stays cached</span>: env vars enter every later
              exec&apos;s cache key, so a sandbox reuses its own layers. A second live test pins this.
            </li>
            <li>
              <span className="font-semibold text-foreground">No extra layer</span>: an env var adds no filesystem
              layer, so it doesn&apos;t count toward the replay layer budget.
            </li>
          </ul>
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-line p-6">
        <Eyebrow>trade-offs, stated in the PR</Eyebrow>
        <ul className="mt-3 grid gap-3 text-[15px] leading-relaxed text-muted md:grid-cols-3">
          <li>
            <span className="font-semibold text-foreground">One cold cache on deploy.</span> Each active sandbox
            replays its history once, same as after an engine restart today.
          </li>
          <li>
            <span className="font-semibold text-foreground">Helper consults left as is.</span> OpenAPPA helper
            runs have no sandbox; keying them by install is a one-line follow-up if wanted.
          </li>
          <li>
            <span className="font-semibold text-foreground">Not verified:</span> the egress-proxy effect from the
            issue. It follows from the same cause, but the proxy wasn&apos;t run.
          </li>
        </ul>
      </section>

      <section className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <a
          href={BRANCH}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          View the PR
        </a>
        <a
          href={REPO}
          className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-panel"
        >
          View the repo
        </a>
        <a
          href="/PR.md"
          className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-panel"
        >
          Read the PR description
        </a>
        <a
          href={ISSUE}
          className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-panel"
        >
          Issue #8662 ↗
        </a>
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-center text-xs text-muted">
        Unofficial demo by Cheryl Aurelia: not affiliated with Archestra.
      </footer>
    </main>
  );
}
