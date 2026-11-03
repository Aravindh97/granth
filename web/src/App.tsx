import { useCallback, useEffect, useState } from "react";
import "./app.css";
import { api } from "./lib/go";
import { Action, Card, Footer, Header, Pill, reportError } from "./lib/ui";
import type { Result } from "./types.gen";

// Envelopes from cmd/web (maps); search.Result inside is generated from Go.
export interface Doc { uri: string; title: string; format: string; pages: number; chunks: number; bytes: number; uploaded?: boolean }
interface Docs { docs: Doc[]; chunks: number; ingest_ms: number; embedder: string }
interface Search { results: Result[] | null; truncated: boolean; took_us: number }
interface Upload { doc?: Doc; error?: string; class?: string }
interface Eval {
  questions: number;
  rows: { mode: string; hit1: number; hit5: number; mrr: number; cite1: number; p50_us: number }[];
  misses: { mode: string; query: string; want: string; got: string }[] | null;
}
type Mode = "hybrid" | "lexical" | "vector";

const examples = ["What is the hotel budget in Coimbatore?", "Do I have to rotate my password every 90 days?", "Which systems need MFA?", "lead time for track pants", "AQL level for major defects in final audit", "कार्यालय का समय क्या है"];

/** Reads a File as base64 without blowing the call stack on large files. */
export async function toBase64(f: Blob) {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(bin);
}

export function Hit({ x, i }: { x: Result; i: number }) {
  const c = x.citation;
  return (
    <div className="res">
      <div className="mono">#{i + 1} {c.source_uri.split("/").pop()} · page {c.page} · {(c.heading_path ?? []).join(" › ")} · blocks {c.block_start}–{c.block_end}</div>
      <div className="muted">rank in BM25: {x.trace.lexical_rank || "–"} · rank in vector: {x.trace.vector_rank || "–"} · fused score {x.trace.fused_score.toFixed(4)}</div>
      <pre>{x.snippet}</pre>
    </div>
  );
}

function Ask() {
  const [q, setQ] = useState(examples[0]);
  const [mode, setMode] = useState<Mode>("hybrid");
  const [r, setR] = useState<Search | null>(null);
  const ask = useCallback(async (query: string) => {
    setR(await api<Search>("GET", `search?q=${encodeURIComponent(query)}&mode=${mode}&k=3`));
  }, [mode]);
  useEffect(() => {
    ask(examples[0]).catch(reportError);
    // first search on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card wide n={1} title="Ask the corpus">
      <form className="row" onSubmit={(e) => { e.preventDefault(); ask(q).catch(reportError); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} size={60} aria-label="question" />
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="mode">
          <option value="hybrid">hybrid (BM25 + vector)</option><option value="lexical">BM25 only</option><option value="vector">vector only</option>
        </select>
        <button type="submit">Search</button>
      </form>
      <div className="chips">
        {examples.map((e) => <button key={e} className="ghost" onClick={() => { setQ(e); ask(e).catch(reportError); }}>{e}</button>)}
      </div>
      {r && <>{(r.results ?? []).map((x, i) => <Hit key={x.chunk_id} x={x} i={i} />)}<div className="muted">{r.took_us} µs</div></>}
    </Card>
  );
}

function Documents({ d, reload }: { d: Docs | null; reload: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [up, setUp] = useState<Upload | null>(null);
  return (
    <Card n={2} title="Documents">
      <table>
        <thead><tr><th>File</th><th>Format</th><th className="num">Pages</th><th className="num">Chunks</th></tr></thead>
        <tbody>
          {d?.docs.map((x) => (
            <tr key={x.uri}><td>{x.uri.split("/").pop()}{x.uploaded && <> <Pill tone="ok">yours</Pill></>}</td><td>{x.format}</td><td className="num">{x.pages}</td><td className="num">{x.chunks}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <input type="file" accept=".md,.txt,.html,.htm,.csv,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="file" />
        <Action variant="ghost" onRun={async () => {
          if (!file) throw new Error("choose a file first");
          setUp(await api<Upload>("POST", "upload", { Name: file.name, Data: await toBase64(file) }));
          await reload();
        }}>Ingest my file</Action>
      </div>
      <div className="muted">
        {!up ? "Markdown, text, HTML, CSV or PDF with a text layer, up to 5 MB. It stays in this tab."
          : up.error ? <><span className="bad">{up.error}</span><br />{up.class}</>
          : <><span className="ok">ingested {up.doc!.title}: {up.doc!.chunks} chunks</span>. Ask it something above.</>}
      </div>
    </Card>
  );
}

export default function App() {
  const [docs, setDocs] = useState<Docs | null>(null);
  const [bad, setBad] = useState<{ file: string; result: string; class?: string }[] | null>(null);
  const [ev, setEv] = useState<Eval | null>(null);
  const [mq, setMq] = useState("who approves business class tickets");
  const [mcp, setMcp] = useState("");
  const reload = useCallback(async () => setDocs(await api<Docs>("GET", "docs")), []);
  useEffect(() => {
    reload().catch(reportError);
  }, [reload]);
  return (
    <>
      <Header repo="granth" title="granth" tagline="search with citations, for agents">
        <p>Documents are parsed by layout, chunked under their headings and indexed for keyword (BM25) and vector search, fused with reciprocal rank fusion. Every result says exactly where it came from. The parser, chunker, index and search from the repo run here as Go WebAssembly.</p>
        <p className="muted">
          The full version ingests on Temporal workflows into OpenSearch, with a Postgres dead-letter ledger.
          {docs && ` ${docs.docs.length} documents, ${docs.chunks} chunks, ingested in ${docs.ingest_ms} ms.`}
        </p>
      </Header>
      <main>
        <Ask />
        <Documents d={docs} reload={reload} />
        <Card n={3} title="Messy files">
          <Action variant="ghost" onRun={async () => setBad(await api<typeof bad>("POST", "bad"))}>Parse the repo's broken files</Action>
          {bad && (
            <table>
              <thead><tr><th>File</th><th>Result</th></tr></thead>
              <tbody>{bad.map((x) => <tr key={x.file}><td className="mono">{x.file}</td><td><span className="bad">{x.result}</span><br /><span className="muted">{x.class ?? ""}</span></td></tr>)}</tbody>
            </table>
          )}
          <div className="muted">Permanent failures are recorded once with the failing step and never retried. Anything else is retried with backoff for up to an hour.</div>
        </Card>
        <Card wide n={4} title="Retrieval eval: 44 labelled questions">
          <Action onRun={async () => setEv(await api<Eval>("POST", "eval"))}>Run</Action>
          {ev && (
            <>
              <table>
                <thead><tr><th>Mode</th><th className="num">hit@1</th><th className="num">hit@5</th><th className="num">MRR@10</th><th className="num">citation@1</th><th className="num">p50</th></tr></thead>
                <tbody>{ev.rows.map((x) => <tr key={x.mode}><td>{x.mode}</td><td className="num">{x.hit1.toFixed(3)}</td><td className="num">{x.hit5.toFixed(3)}</td><td className="num">{x.mrr.toFixed(3)}</td><td className="num">{x.cite1.toFixed(3)}</td><td className="num">{x.p50_us} µs</td></tr>)}</tbody>
              </table>
              <div className="muted">
                Misses in the top 5:
                {(ev.misses ?? []).map((m, i) => <div key={i}>[{m.mode}] {m.query} → wanted {m.want}, got {m.got || "nothing"}</div>)}
              </div>
            </>
          )}
        </Card>
        <Card wide n={5} title="The MCP tool an agent calls">
          <div className="row">
            <input value={mq} onChange={(e) => setMq(e.target.value)} size={50} aria-label="MCP query" />
            <Action variant="ghost" onRun={async () => {
              const req = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search", arguments: { query: mq, k: 2, max_tokens: 300 } } };
              const r = await api<{ result: { structuredContent: unknown } }>("POST", "mcp", req);
              setMcp("→ " + JSON.stringify(req) + "\n\n← " + JSON.stringify(r.result.structuredContent, null, 1));
            }}>Send tools/call search</Action>
          </div>
          {mcp && <pre className="out">{mcp}</pre>}
        </Card>
      </main>
      <Footer>The browser version uses the in-memory index and the offline hashing embedder (lexical, not semantic) and has no OCR. The README's OpenSearch numbers come from the full version.</Footer>
    </>
  );
}
