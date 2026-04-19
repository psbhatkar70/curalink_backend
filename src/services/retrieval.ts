import type { RankedBundle, StandardDoc } from "../types.js";
import { fetchClinicalTrials } from "./sources/clinicaltrials.js";
import { fetchOpenAlex } from "./sources/openalex.js";
import { fetchPubMed } from "./sources/pubmed.js";

export async function deepRetrieve(expandedQueries: string[], disease: string): Promise<RankedBundle> {
  const seedQuery = expandedQueries[0] ?? disease;
  const [pubmed, openalex, clinical] = await Promise.allSettled([
    fetchPubMed(seedQuery, 50),
    fetchOpenAlex(seedQuery, 50),
    fetchClinicalTrials(disease, "RECRUITING", 50),
  ]);

  const pubmedDocs = pubmed.status === "fulfilled" ? pubmed.value : [];
  const openalexDocs = openalex.status === "fulfilled" ? openalex.value : [];
  const clinicalDocs = clinical.status === "fulfilled" ? clinical.value : [];

  const merged = dedupeByTitle([...pubmedDocs, ...openalexDocs, ...clinicalDocs]);

  return {
    docs: merged,
    totalCandidates: merged.length,
    sourceCounts: {
      pubmed: pubmedDocs.length,
      openalex: openalexDocs.length,
      clinicaltrials: clinicalDocs.length,
    },
  };
}

function dedupeByTitle(docs: StandardDoc[]): StandardDoc[] {
  const map = new Map<string, StandardDoc>();
  for (const doc of docs) {
    if (!doc?.title || typeof doc.title !== "string") {
      console.warn("Skipping doc during dedupe because title is invalid", doc?.id ?? "unknown");
      continue;
    }
    const key = doc.title.toLowerCase().trim();
    if (!key) {
      console.warn("Skipping doc during dedupe because title is empty", doc.id);
      continue;
    }
    if (!map.has(key)) map.set(key, doc);
  }
  return [...map.values()];
}
