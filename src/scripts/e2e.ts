import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8080";

interface TestCase {
  name: string;
  request: { method: string; path: string; body?: unknown };
  validate: (response: any) => { ok: boolean; message: string }[];
}

const cases: TestCase[] = [
  {
    name: "Health check",
    request: { method: "GET", path: "/health" },
    validate: (json) => [
      { ok: json?.ok === true, message: "health.ok must be true" },
    ],
  },
  {
    name: "Lung cancer main research",
    request: {
      method: "POST",
      path: "/api/research",
      body: {
        sessionId: "demo-lung-1",
        patientName: "John Smith",
        disease: "Lung cancer",
        query: "Latest treatment",
        location: "Toronto, Canada",
      },
    },
    validate: (json) => [
      { ok: Array.isArray(json?.expandedQueries) && json.expandedQueries.length > 0, message: "expandedQueries must exist" },
      { ok: Number(json?.retrieval?.totalCandidates ?? 0) >= 50, message: "retrieval.totalCandidates must be >= 50" },
      { ok: typeof json?.answer?.conditionOverview === "string" && json.answer.conditionOverview.length > 0, message: "answer.conditionOverview must be non-empty" },
      { ok: Array.isArray(json?.answer?.researchInsights) && json.answer.researchInsights.length >= 1, message: "answer.researchInsights.length must be >= 1" },
      { ok: Array.isArray(json?.answer?.sources) && json.answer.sources.length >= 1, message: "answer.sources.length must be >= 1" },
    ],
  },
  {
    name: "Lung cancer follow-up",
    request: {
      method: "POST",
      path: "/api/research",
      body: {
        sessionId: "demo-lung-1",
        patientName: "John Smith",
        disease: "Lung cancer",
        query: "Can I take Vitamin D?",
        location: "Toronto, Canada",
      },
    },
    validate: (json) => [
      { ok: Array.isArray(json?.expandedQueries) && json.expandedQueries.some((q: string) => q.toLowerCase().includes("lung cancer")), message: "expandedQueries should still reflect lung cancer context" },
      { ok: typeof json?.answer?.conditionOverview === "string" && json.answer.conditionOverview.length > 0, message: "answer.conditionOverview must be present" },
      { ok: Array.isArray(json?.answer?.sources) && json.answer.sources.length >= 1, message: "answer.sources should include source backing" },
    ],
  },
  {
    name: "Diabetes clinical trial",
    request: {
      method: "POST",
      path: "/api/research",
      body: {
        sessionId: "demo-diabetes-1",
        patientName: "Ava",
        disease: "Diabetes",
        query: "Clinical trials for diabetes",
        location: "India",
      },
    },
    validate: (json) => [
      { ok: json?.retrieval?.sourceCounts?.clinicaltrials !== undefined, message: "retrieval.sourceCounts.clinicaltrials must be present" },
      { ok: Array.isArray(json?.answer?.clinicalTrials) && json.answer.clinicalTrials.length >= 1, message: "answer.clinicalTrials.length must be >= 1" },
    ],
  },
  {
    name: "Alzheimer's researcher query",
    request: {
      method: "POST",
      path: "/api/research",
      body: {
        sessionId: "demo-alz-1",
        patientName: "Mark",
        disease: "Alzheimer's disease",
        query: "Top researchers in Alzheimer's disease",
        location: "USA",
      },
    },
    validate: (json) => {
      const hasPublication = Array.isArray(json?.rankedDocs) && json.rankedDocs.some((doc: any) => doc.sourceType === "pubmed" || doc.sourceType === "openalex");
      const sourcesValid = Array.isArray(json?.answer?.sources) && json.answer.sources.every((item: any) => item?.title && Array.isArray(item?.authors) && item.authors.length >= 0 && item?.platform && item?.supportingSnippet);
      return [
        { ok: hasPublication, message: "rankedDocs must include at least one publication" },
        { ok: sourcesValid, message: "each source must have title/authors/platform/supportingSnippet" },
      ];
    },
  },
  {
    name: "Heart disease recency test",
    request: {
      method: "POST",
      path: "/api/research",
      body: {
        sessionId: "demo-heart-1",
        patientName: "Liam",
        disease: "Heart disease",
        query: "Recent studies on heart disease",
        location: "UK",
      },
    },
    validate: (json) => {
      const recencyPresent = Array.isArray(json?.rankedDocs) && json.rankedDocs.every((doc: any) => doc?.scoreBreakdown?.recencyScore !== undefined);
      return [
        { ok: recencyPresent, message: "rankedDocs[*].scoreBreakdown.recencyScore must be present" },
        { ok: typeof json?.answer?.conditionOverview === "string" && json.answer.conditionOverview.length > 0, message: "answer.conditionOverview must be present" },
      ];
    },
  },
];

async function runTest(testCase: TestCase): Promise<{ name: string; success: boolean; results: Array<{ ok: boolean; message: string }>; status: number }> {
  const url = `${baseUrl}${testCase.request.path}`;
  const response = await fetch(url, {
    method: testCase.request.method,
    headers: testCase.request.body ? { "Content-Type": "application/json" } : undefined,
    body: testCase.request.body ? JSON.stringify(testCase.request.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  const results = testCase.validate(json);
  return {
    name: testCase.name,
    success: results.every((item) => item.ok) && response.status >= 200 && response.status < 300,
    results,
    status: response.status,
  };
}

async function main(): Promise<void> {
  const reportLines: string[] = ["# E2E Validation Report", "", `Base URL: ${baseUrl}`, ""]; 

  const results = [] as Array<{ name: string; success: boolean; status: number; details: string[] }>;

  for (const testCase of cases) {
    process.stdout.write(`Running ${testCase.name}... `);
    const result = await runTest(testCase);
    const detailLines = result.results.map((item) => `${item.ok ? "✔" : "✖"} ${item.message}`);
    const summary = result.success ? "PASS" : "FAIL";
    console.log(summary);
    results.push({ name: result.name, success: result.success, status: result.status, details: detailLines });

    reportLines.push(`## ${result.name}`);
    reportLines.push(`- status: ${result.status}`);
    reportLines.push(`- result: ${result.success ? "PASS" : "FAIL"}`);
    reportLines.push(...detailLines.map((line) => `  - ${line}`));
    reportLines.push("");
  }

  reportLines.push("## Summary", "");
  reportLines.push(`- passed: ${results.filter((item) => item.success).length}/${results.length}`);
  reportLines.push(`- failed: ${results.filter((item) => !item.success).length}/${results.length}`);

  const reportDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "reports");
  await writeFile(join(reportDir, "e2e-report.md"), reportLines.join("\n"), "utf-8");
  console.log(`E2E report generated at ${reportDir.replace(/\\/g, "/")}/e2e-report.md`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
