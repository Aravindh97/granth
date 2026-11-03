import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import App, { toBase64 } from "./App";
import { setTransport } from "./lib/go";
import type { Result } from "./types.gen";

afterEach(cleanup);

test("files are sent as base64", async () => {
  expect(await toBase64(new Blob(["héllo"]))).toBe(btoa(unescape(encodeURIComponent("héllo"))));
});

test("searches on load and shows each result's citation and trace", async () => {
  const hit: Result = {
    chunk_id: "c1", snippet: "Tier 2: 5,000 INR",
    citation: { doc_id: "d", source_uri: "corpus/travel-policy.md", title: "Travel", page: 1, heading_path: ["Policy", "Hotels"], block_start: 4, block_end: 4 },
    trace: { lexical_rank: 1, fused_score: 0.0328 },
  };
  const paths: string[] = [];
  setTransport(async (_m, path) => {
    paths.push(path);
    if (path === "docs") return { status: 200, body: { docs: [{ uri: "corpus/travel-policy.md", title: "t", format: "markdown", pages: 1, chunks: 3, bytes: 9 }], chunks: 3, ingest_ms: 1, embedder: "hashing" } };
    return { status: 200, body: { results: [hit], truncated: false, took_us: 12 } };
  });
  render(<App />);
  expect(await screen.findByText(/#1 travel-policy.md · page 1 · Policy › Hotels · blocks 4–4/)).toBeTruthy();
  expect(screen.getByText(/rank in BM25: 1 · rank in vector: – · fused score 0.0328/)).toBeTruthy();
  fireEvent.click(screen.getByText("Which systems need MFA?"));
  await screen.findAllByText("Tier 2: 5,000 INR");
  expect(paths).toContain("search?q=Which%20systems%20need%20MFA%3F&mode=hybrid&k=3");
});
