import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const benchmarkQueries = [
  { disease: "Lung cancer", query: "Latest treatment", location: "Toronto, Canada" },
  { disease: "Diabetes", query: "Clinical trials for diabetes", location: "India" },
  { disease: "Alzheimer's disease", query: "Top researchers in Alzheimer's disease", location: "USA" },
  { disease: "Heart disease", query: "Recent studies on heart disease", location: "UK" },
];

async function run(): Promise<void> {
  const sessionId = `bench-${Date.now()}`;
  const rows: Array<{
    disease: string;
    query: string;
    status: number;
    latencyMs: number;
    cacheHit: boolean;
    totalCandidates: number;
    sourceCounts: string;
  }> = [];

  for (const item of benchmarkQueries) {
    const started = Date.now();
    const response = await fetch("http://localhost:8080/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, patientName: "Benchmark User", sessionId }),
    });
    const elapsed = Date.now() - started;
    const json = await response.json();
    console.log("----");
    console.log(`${item.disease} | ${item.query}`);
    console.log("status:", response.status, "latency_ms:", elapsed);
    console.log("cacheHit:", json.cacheHit, "totalCandidates:", json.retrieval?.totalCandidates);
    console.log("sourceCounts:", json.retrieval?.sourceCounts);

    rows.push({
      disease: item.disease,
      query: item.query,
      status: response.status,
      latencyMs: elapsed,
      cacheHit: Boolean(json.cacheHit),
      totalCandidates: Number(json.retrieval?.totalCandidates ?? 0),
      sourceCounts: JSON.stringify(json.retrieval?.sourceCounts ?? {}),
    });
  }

  await writeMarkdownReport(rows);
  console.log("Benchmark report written to backend/reports/benchmark.md");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function writeMarkdownReport(
  rows: Array<{
    disease: string;
    query: string;
    status: number;
    latencyMs: number;
    cacheHit: boolean;
    totalCandidates: number;
    sourceCounts: string;
  }>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const lines = [
    "# Benchmark Report",
    "",
    `Generated: ${timestamp}`,
    "",
    "| Disease | Query | Status | Latency (ms) | Cache Hit | Candidates | Source Counts |",
    "|---|---|---:|---:|---|---:|---|",
    ...rows.map(
      (row) =>
        `| ${row.disease} | ${row.query} | ${row.status} | ${row.latencyMs} | ${row.cacheHit} | ${row.totalCandidates} | \`${row.sourceCounts}\` |`
    ),
    "",
    "## Quick Checks",
    "",
    `- Successful responses: ${rows.filter((row) => row.status >= 200 && row.status < 300).length}/${rows.length}`,
    `- Avg latency (ms): ${Math.round(rows.reduce((sum, row) => sum + row.latencyMs, 0) / Math.max(rows.length, 1))}`,
    `- Avg candidates: ${Math.round(rows.reduce((sum, row) => sum + row.totalCandidates, 0) / Math.max(rows.length, 1))}`,
  ];

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const reportDir = join(scriptDir, "..", "..", "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, "benchmark.md"), lines.join("\n"), "utf-8");
}
