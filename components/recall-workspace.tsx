"use client";
import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Search,
  ArrowRight,
  RefreshCw,
  BookOpen,
  CheckCircle2,
  Link2,
  Copy,
  Settings2,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  examples,
  teams,
  type Comparison,
  type Memory,
  type Source,
  type AgentInput,
} from "@/lib/recall/core";
type Check = { service: string; ok: boolean; detail: string };
type Result = {
  withMemory: Comparison;
  withoutMemory: Comparison;
  mode?: "live" | "evidence_only";
  sourcePreviews?: {
    product: string;
    items: { id: string; excerpt: string }[];
  }[];
  sources: Source[];
  checkedAt: string;
  products: string[];
  market: string;
  requirements: string;
  trace: string[];
};
type ResponseBody = {
  error?: string;
  issues?: string[];
  memories?: Memory[];
  checks?: Check[];
  result?: Result;
  saved?: boolean;
  warning?: string;
};
const defaultExample = examples[0];
function uuid() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
    ).toString(16),
  );
}
export default function Home() {
  const [tab, setTab] = useState("compare");
  const [team, setTeam] = useState("studio");
  const [category, setCategory] = useState<string>("laptops");
  const [products, setProducts] = useState<string[]>([
    ...defaultExample.products,
  ]);
  const [market, setMarket] = useState("India");
  const [requirements, setRequirements] = useState<string>(
    defaultExample.requirements,
  );
  const [memories, setMemories] = useState<Memory[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [baseline, setBaseline] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const connection = useRef<Promise<boolean> | null>(null);
  const pendingNote = useRef<{ signature: string; id: string } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [local, setLocal] = useState(false);
  const booted = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [configKnown, setConfigKnown] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [kind, setKind] = useState("requirement");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const guard = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const verified = checks.length === 3 && checks.every((c) => c.ok);
  const current = result
    ? baseline
      ? result.withoutMemory
      : result.withMemory
    : null;
  async function loadSettings() {
    try {
      const response = await fetch("/api/agent", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        issues: string[];
        configured: boolean;
        authorized: boolean;
        local: boolean;
      };
      setIssues(data.issues);
      setConfigKnown(data.configured);
      setLocal(data.local);
      setSessionReady(data.authorized);
      return data;
    } catch {
      setError(
        "We could not reach REcall. Check that the server is running, then retry.",
      );
      return null;
    }
  }
  async function connectWorkspace() {
    if (connection.current) return connection.current;
    setConnecting(true);
    connection.current = (async () => {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const invite = fragment.get("invite");
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (!response.ok)
          setError(data.error || "Unable to open this workspace.");
        else if (invite)
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        const settings = await loadSettings();
        return response.ok && !!settings?.authorized;
      } catch {
        setError(
          "Unable to open the workspace. Check your connection and retry.",
        );
        return false;
      } finally {
        setConnecting(false);
        connection.current = null;
      }
    })();
    return connection.current;
  }
  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      void connectWorkspace();
    }
  }, []);
  useEffect(() => {
    if (error || message)
      feedback.current?.scrollIntoView({ block: "nearest" });
  }, [error, message]);
  useEffect(() => {
    if (result) resultsRef.current?.scrollIntoView({ block: "start" });
  }, [result]);
  function changed() {
    setResult(null);
    setBaseline(false);
    setError("");
    setMessage("");
  }
  function useExample(index: number) {
    const example = examples[index];
    setCategory(example.category);
    setProducts([...example.products]);
    setRequirements(example.requirements);
    changed();
    setMessage(
      "Example request loaded. Run a web comparison to retrieve current information.",
    );
  }
  async function perform(action: AgentInput["action"]) {
    if (guard.current) return;
    setError("");
    setMessage("");
    const names = products.map((x) => x.trim()).filter(Boolean);
    if (action === "compare") {
      if (
        names.length < 2 ||
        new Set(names.map((x) => x.toLowerCase())).size !== names.length
      ) {
        setError("Enter at least two different product names.");
        return;
      }
      if (requirements.trim().length < 10 || market.trim().length < 2) {
        setError("Enter a market and at least 10 characters of requirements.");
        return;
      }
    }
    if (action === "remember" && note.trim().length < 10) {
      setError(
        "Describe the requirement, decision, or correction in at least 10 characters.",
      );
      return;
    }
    guard.current = true;
    setBusy(action);
    try {
      if (!sessionReady && !(await connectWorkspace())) return;
      if (action === "verify") {
        setChecks([]);
        const updated = await loadSettings();
        if (!updated?.configured) {
          setError(
            "Service setup is incomplete. The owner must add the missing server settings before research can run.",
          );
          return;
        }
      }
      const independent =
        action === "verify" || action === "seed" || action === "history";
      const signature = JSON.stringify({
        team,
        kind,
        note,
        products: names,
        requirements,
      });
      if (action === "remember" && pendingNote.current?.signature !== signature)
        pendingNote.current = { signature, id: uuid() };
      const requestId =
        action === "remember" ? pendingNote.current!.id : uuid();
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          team,
          category,
          products: independent ? [...defaultExample.products] : names,
          market: independent ? "India" : market.trim() || "India",
          requirements: independent
            ? "Recall current team purchasing preferences and corrections."
            : requirements.trim(),
          note,
          kind,
          requestId,
        }),
        signal: AbortSignal.timeout(210000),
      });
      const data = (await response.json()) as ResponseBody;
      if (!response.ok) {
        if (data.issues) {
          setIssues(data.issues);
          setConfigKnown(false);
        }
        throw new Error(data.error || "The request failed. Please retry.");
      }
      if (data.memories) setMemories(data.memories);
      if (data.checks) {
        setChecks(data.checks);
        setMessage(
          data.checks.every((c) => c.ok)
            ? "All service checks passed. Now compare products, save a note, and reload to verify memory persistence."
            : "Some services need attention. See each result below.",
        );
      }
      if (data.result) {
        if (data.result.mode === "evidence_only") setChecks([]);
        setResult(data.result);
        setBaseline(false);
        setMessage(
          data.result.mode === "evidence_only"
            ? "Live search findings loaded. The comparison service is unavailable, so no AI recommendation was generated."
            : "Comparison ready. Check source links and exact product variants before making a decision.",
        );
      }
      if (action === "history") {
        setResult(null);
        setMessage(
          "Team memory refreshed from Hindsight. Run a new comparison to use these records.",
        );
      }
      if (data.saved) {
        setResult(null);
        if (action === "remember") {
          setNote("");
          pendingNote.current = null;
        }
        setMessage(
          data.warning ||
            "Team memory saved. Your next comparison will use it.",
        );
      }
    } catch (e) {
      if (action === "compare" || action === "verify") setChecks([]);
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "This request timed out. If you were saving a note, refresh memory before retrying; the save may have completed."
          : e instanceof Error
            ? e.message
            : "The request failed.",
      );
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  async function copyComparison() {
    if (!result || !current) return;
    try {
      await navigator.clipboard.writeText(
        [
          "REcall — " +
            (baseline ? "Without saved memory" : "With team memory"),
          ...result.products,
          result.market,
          result.checkedAt,
          current.recommendation.choice,
          current.recommendation.reason,
          current.memoryImpact,
          ...current.products.flatMap((p) => [
            p.name,
            ...p.claims.map(
              (c) =>
                c.label + ": " + c.value + " [" + c.sourceIds.join(", ") + "]",
            ),
            p.reviewSummary,
          ]),
          ...result.sources.map((s) => `${s.id}: ${s.title} — ${s.url}`),
        ].join("\n"),
      );
      setMessage("Comparison copied with source links.");
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the comparison text manually.",
      );
    }
  }
  function citations(ids: string[]) {
    return (
      <span className="citations">
        {ids.map((id) => {
          const source = result?.sources.find((s) => s.id === id);
          return source ? (
            <a
              key={id}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source ${id}: ${source.title}`}
            >
              {id}
              <Link2 size={11} aria-hidden="true" />
            </a>
          ) : null;
        })}
      </span>
    );
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#main">
          <BrainCircuit aria-hidden="true" />
          REcall
        </a>
        <span className="topmeta">Business buying, with memory</span>
        <button
          className={"status " + (verified ? "verified" : "")}
          onClick={() => setTab("connection")}
        >
          {verified
            ? "Research connected"
            : !sessionReady
              ? connecting
                ? "Opening workspace"
                : "Workspace access needed"
              : configKnown
                ? "Ready to research"
                : "Setup needed"}
        </button>
      </header>
      <main id="main" className="workspace">
        <div className="heading">
          <div>
            <div className="eyebrow">
              A purchasing assistant for small teams
            </div>
            <h1>Find the right fit for your team.</h1>
            <p>
              Compare current prices, specifications, and reviews. REcall
              remembers what matters to your team.
            </p>
          </div>
          <div className="team-picker">
            <label htmlFor="team">Team workspace</label>
            <select
              id="team"
              value={team}
              disabled={!!busy}
              onChange={(e) => {
                setTeam(e.target.value);
                setMemories([]);
                setNote("");
                changed();
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="REcall sections">
            <TabsTrigger value="compare">
              <Search size={15} />
              Compare products
            </TabsTrigger>
            <TabsTrigger value="memory">
              <BookOpen size={15} />
              Team memory
            </TabsTrigger>
            <TabsTrigger value="connection">
              <Settings2 size={15} />
              Service status
            </TabsTrigger>
          </TabsList>
          <div ref={feedback} className="feedback">
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div
                className={
                  result?.mode === "evidence_only" ? "notice" : "notice success"
                }
                role="status"
              >
                {message}
              </div>
            )}
          </div>
          {busy && (
            <div className="working" role="status">
              <LoaderCircle className="spin" size={17} />
              {busy === "compare"
                ? "Retrieving memory, researching sources, and building the comparison. This may take a few minutes."
                : busy === "verify"
                  ? "Checking server settings and service access…"
                  : "Working with team memory…"}
            </div>
          )}
          <TabsContent value="compare">
            <div className="comparison-layout">
              <section className="panel request-panel">
                <div className="eyebrow">Start with two products</div>
                <h2>What would you like to compare?</h2>
                <p className="muted">
                  Choose an example or enter exact model names below.
                </p>
                <div className="example-buttons">
                  {examples.map((e, i) => (
                    <button
                      type="button"
                      key={e.label}
                      onClick={() => useExample(i)}
                      disabled={!!busy}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <details className="purchase-options">
                  <summary>Market and category · {market}</summary>
                  <div className="field-row">
                    <div>
                      <label htmlFor="category">Product category</label>
                      <select
                        id="category"
                        value={category}
                        disabled={!!busy}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          changed();
                        }}
                      >
                        <option value="laptops">Work laptops</option>
                        <option value="monitors">Office monitors</option>
                        <option value="headsets">Meeting headsets</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="market">Market / country</label>
                      <input
                        id="market"
                        value={market}
                        maxLength={80}
                        disabled={!!busy}
                        onChange={(e) => {
                          setMarket(e.target.value);
                          changed();
                        }}
                      />
                    </div>
                  </div>
                </details>
                <div className="product-inputs">
                  {products.map((p, i) => (
                    <div key={i}>
                      <label htmlFor={"product-" + i}>
                        Product {i + 1}
                        {i === 2 ? " (optional)" : ""}
                      </label>
                      <input
                        id={"product-" + i}
                        value={p}
                        maxLength={150}
                        disabled={!!busy}
                        placeholder={
                          i === 2 ? "Third model name" : "Enter brand and model"
                        }
                        onChange={(e) => {
                          setProducts(
                            products.map((x, j) =>
                              j === i ? e.target.value : x,
                            ),
                          );
                          changed();
                        }}
                      />
                      {i === 2 && (
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => {
                            setProducts(products.slice(0, 2));
                            changed();
                          }}
                        >
                          Remove third product
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="text-button"
                  disabled={!!busy || products.length === 3}
                  onClick={() => {
                    setProducts([...products, ""]);
                    changed();
                  }}
                >
                  + Add a third product
                </button>
                <label htmlFor="requirements">What matters most?</label>
                <textarea
                  id="requirements"
                  value={requirements}
                  maxLength={1800}
                  disabled={!!busy}
                  onChange={(e) => {
                    setRequirements(e.target.value);
                    changed();
                  }}
                />
                <div className="actions">
                  <Button disabled={!!busy} onClick={() => perform("compare")}>
                    <Search size={17} />
                    {busy === "compare" ? "Researching…" : "Compare products"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => {
                      setProducts(["", ""]);
                      setRequirements("");
                      changed();
                    }}
                  >
                    Clear request
                  </Button>
                </div>
              </section>
              <aside className="panel memory-intro">
                <BrainCircuit size={26} />
                <div className="eyebrow">Your team’s buying context</div>
                <h2>A better fit, every time.</h2>
                <p>
                  Save requirements once. REcall uses them in your next
                  comparison, even after you return another day.
                </p>
                <div className="memory-count">
                  <span>{memories.length}</span>relevant records loaded
                </div>
                <Button
                  variant="outline"
                  onClick={() => setTab("memory")}
                  disabled={!!busy}
                >
                  Manage team memory
                  <ArrowRight size={16} />
                </Button>
                <hr />
                <h3>How it works</h3>
                <ol>
                  <li>Choose the models you’re considering.</li>
                  <li>Review current evidence side by side.</li>
                  <li>Save what your team decides.</li>
                </ol>
                <p className="small muted">
                  Sources are linked. Missing information stays marked as
                  unverified.
                </p>
              </aside>
            </div>
            <section ref={resultsRef} className="panel result-panel">
              <div className="result-header">
                <div>
                  <div className="eyebrow">Your comparison</div>
                  <h2>The differences that matter.</h2>
                </div>
                {result && (
                  <Button variant="outline" onClick={copyComparison}>
                    <Copy size={16} />
                    Copy comparison
                  </Button>
                )}
              </div>
              {!result || !current ? (
                <div className="empty">
                  <Search size={28} />
                  <h3>Your comparison will appear here.</h3>
                  <p>
                    Choose two products above and select Compare products.
                    You’ll get a recommendation, source links, and clear
                    trade-offs.
                  </p>
                  <p className="small muted">
                    No purchases are made. Confirm current prices and
                    availability with the seller.
                  </p>
                </div>
              ) : (
                <>
                  <div className="result-meta">
                    Web research completed{" "}
                    {new Date(result.checkedAt).toLocaleString()} ·{" "}
                    {result.market} · {result.sources.length} sources
                  </div>
                  {result.mode === "evidence_only" && (
                    <div className="notice" role="status">
                      <strong>Source preview mode.</strong> The comparison
                      service is temporarily unavailable. The links and excerpts
                      below come from this request’s web search; prices,
                      specifications, reviews, and a buying recommendation have
                      not been verified by the comparison model.
                    </div>
                  )}
                  <div
                    className="view-switch"
                    role="group"
                    aria-label="Compare memory effect"
                  >
                    <button
                      aria-pressed={!baseline}
                      onClick={() => setBaseline(false)}
                    >
                      With team memory
                    </button>
                    <button
                      aria-pressed={baseline}
                      onClick={() => setBaseline(true)}
                    >
                      Without saved memory
                    </button>
                  </div>
                  <div className="recommendation">
                    <span className="eyebrow">
                      Suggested choice · review before purchasing
                    </span>
                    <h3>{current.recommendation.choice}</h3>
                    <p>
                      {current.recommendation.reason}
                      {citations(current.recommendation.sourceIds)}
                    </p>
                    <div className="memory-impact">
                      <BrainCircuit size={18} />
                      <div>
                        {current.memoryImpact}
                        <div className="memory-links">
                          {current.recommendation.memoryIds.map((id) => (
                            <button
                              key={id}
                              onClick={() => {
                                setTab("memory");
                                setMessage(
                                  "Evidence " +
                                    id +
                                    " is shown in the retrieved records below.",
                                );
                              }}
                            >
                              {id}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className="comparison-scroll"
                    role="region"
                    aria-label="Product comparison table"
                    tabIndex={0}
                  >
                    <table className="comparison-table">
                      <caption>
                        Compare specifications, reviews, and open questions
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">What matters</th>
                          {current.products.map((p) => (
                            <th scope="col" key={p.name}>
                              {p.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(
                          new Set(
                            current.products.flatMap((p) =>
                              p.claims.map((c) => c.label),
                            ),
                          ),
                        ).map((label) => (
                          <tr key={label}>
                            <th scope="row">{label}</th>
                            {current.products.map((p) => {
                              const claim = p.claims.find(
                                (c) => c.label === label,
                              );
                              return (
                                <td key={p.name}>
                                  {claim ? (
                                    <>
                                      {claim.value}
                                      {citations(claim.sourceIds)}
                                    </>
                                  ) : (
                                    "Not verified"
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr>
                          <th scope="row">Review findings</th>
                          {current.products.map((p) => (
                            <td key={p.name}>
                              {p.reviewSummary}
                              {citations(p.reviewSourceIds)}
                            </td>
                          ))}
                        </tr>
                        <tr className="unknown-row">
                          <th scope="row">Still to verify</th>
                          {current.products.map((p) => (
                            <td key={p.name}>
                              {p.uncertainties.length ? (
                                <ul>
                                  {p.uncertainties.map((u, i) => (
                                    <li key={i}>{u}</li>
                                  ))}
                                </ul>
                              ) : (
                                "Confirm price, stock, and exact variant with the seller."
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {result.mode === "evidence_only" && (
                    <div className="sources">
                      <h3>Search findings to inspect</h3>
                      {result.sourcePreviews?.map((group) => (
                        <div key={group.product}>
                          <h4>{group.product}</h4>
                          <ul>
                            {group.items.map((item, i) => {
                              const src = result.sources.find(
                                (s) => s.id === item.id,
                              );
                              return src ? (
                                <li key={`${item.id}-${i}`}>
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {src.title} · {item.id}
                                  </a>
                                  <p>
                                    {item.excerpt ||
                                      "Open the source to inspect the product information."}
                                  </p>
                                </li>
                              ) : null;
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                  <details className="sources">
                    <summary>
                      All consulted sources ({result.sources.length})
                    </summary>
                    <ol>
                      {result.sources.map((s) => (
                        <li key={s.id}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {s.id} · {s.title}
                          </a>
                          <span>{new URL(s.url).hostname}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                  <details className="trace">
                    <summary>Agent activity</summary>
                    <ol>
                      {result.trace.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                  </details>
                  <div className="result-next">
                    <p>
                      Found a new requirement or made a decision? Save a note
                      for the next comparison.
                    </p>
                    <Button onClick={() => setTab("memory")}>
                      Record what your team learned
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </>
              )}
            </section>
          </TabsContent>
          <TabsContent value="memory">
            <div className="memory-layout">
              <section className="panel">
                <div className="eyebrow">Persistent team context</div>
                <h2>{teams.find((t) => t.id === team)?.name} memory</h2>
                <p className="muted">
                  Your team’s saved requirements and decisions help shape future
                  recommendations. Refresh to retrieve them after returning to
                  the app.
                </p>
                <div className="actions">
                  <Button disabled={!!busy} onClick={() => perform("history")}>
                    <RefreshCw size={16} />
                    Refresh memory
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => perform("seed")}
                  >
                    Load example team history
                  </Button>
                </div>
                <p className="small muted">
                  Try four synthetic example requirements for this team. Loading
                  them again updates the same records.
                </p>
                {memories.length ? (
                  <div className="memory-list">
                    {memories.map((m) => (
                      <article id={"memory-" + m.id} key={m.id}>
                        <code>{m.id}</code>
                        <p>{m.text}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty compact">
                    <BookOpen size={24} />
                    <p>
                      No records retrieved yet. Refresh memory, load the sample
                      team history, or save your own requirement.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="eyebrow">Learn from a real decision</div>
                <h2>Remember for next time</h2>
                <label htmlFor="kind">What are you recording?</label>
                <select
                  id="kind"
                  value={kind}
                  disabled={!!busy}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="requirement">Team requirement</option>
                  <option value="decision">
                    Confirmed decision or experience
                  </option>
                  <option value="correction">
                    Correction to an earlier record
                  </option>
                </select>
                <label htmlFor="note">Your confirmed note</label>
                <textarea
                  id="note"
                  maxLength={2500}
                  value={note}
                  disabled={!!busy}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Example: Our team now needs USB-C charging on every laptop. This replaces our earlier preference for a lower purchase price."
                />
                <p className="small muted">
                  Save a confirmed requirement, decision, or correction for
                  future comparisons.
                </p>
                <Button disabled={!!busy} onClick={() => perform("remember")}>
                  Save team note
                  <CheckCircle2 size={16} />
                </Button>
                <Button
                  className="return-button"
                  variant="outline"
                  onClick={() => setTab("compare")}
                >
                  Return to comparison
                </Button>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="connection">
            <section className="panel connection">
              <div className="eyebrow">Working in the background</div>
              <h2>Research service status</h2>
              <p>
                REcall manages the connection for you. You don’t need to enter
                an API key or access code here.
              </p>
              <div className="settings-state">
                <ShieldCheck size={20} />
                <div>
                  <strong>
                    {!sessionReady
                      ? "Workspace access needed"
                      : configKnown
                        ? "Ready to request research"
                        : "Research setup is incomplete"}
                  </strong>
                  <p>
                    {!sessionReady
                      ? "For a hosted workspace, open the access link from its owner. Local development connects automatically."
                      : configKnown
                        ? "Your server settings are present. The next comparison will use live research and saved team memory."
                        : "The workspace owner must configure an AI provider, web research, and Hindsight on the server. Repeatedly retrying will not fix missing settings."}
                  </p>
                </div>
              </div>
              <div className="actions">
                <Button
                  variant="outline"
                  disabled={!!busy || connecting}
                  onClick={async () => {
                    setError("");
                    setMessage("");
                    await connectWorkspace();
                  }}
                >
                  Retry connection
                </Button>
                <Button
                  disabled={
                    !!busy || connecting || !sessionReady || !configKnown
                  }
                  onClick={() => perform("verify")}
                >
                  Check research services
                </Button>
              </div>
              {local && issues.length > 0 && (
                <details className="owner-settings">
                  <summary>Owner setup details</summary>
                  <ul>
                    {issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <p>
                    Add these values to <code>.env.local</code> beside{" "}
                    <code>package.json</code>, then restart{" "}
                    <code>npm run dev</code>. No team access code is needed
                    locally.
                  </p>
                </details>
              )}
              {checks.length > 0 && (
                <div className="check-results">
                  {checks.map((c) => (
                    <article
                      key={c.service}
                      className={c.ok ? "check-pass" : "check-fail"}
                    >
                      <strong>
                        {c.ok ? "Connected" : "Needs attention"} · {c.service}
                      </strong>
                      <p>{c.detail}</p>
                    </article>
                  ))}
                </div>
              )}
              <p className="small muted connection-note">
                Checks confirm service access. To demonstrate memory, save a
                note, reload, and refresh team memory.
              </p>
              <Button variant="outline" onClick={() => setTab("compare")}>
                Back to comparison
                <ArrowRight size={16} />
              </Button>
            </section>
          </TabsContent>
        </Tabs>
        <footer>
          REcall · Source-backed product research for business teams · Human
          decisions, persistent context
        </footer>
      </main>
    </>
  );
}
