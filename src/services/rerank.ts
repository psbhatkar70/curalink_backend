import type { StandardDoc } from "../types.js";

const sourceCredibility: Record<string, number> = {
  pubmed: 1,
  clinicaltrials: 0.95,
  openalex: 0.9,
};

export function rerankDocs(docs: StandardDoc[], query: string, topK = 8): StandardDoc[] {
  const now = new Date().getFullYear();
  const queryTerms = tokenize(query);
  const diseaseHint = queryTerms.slice(0, 3);
  const scored = docs
    .filter((doc) => (typeof doc.title === "string" && doc.title.trim()) || (typeof doc.abstract === "string" && doc.abstract.trim()))
    .map((doc) => {
      const titleText = typeof doc.title === "string" ? doc.title : "";
      const abstractText = typeof doc.abstract === "string" ? doc.abstract : "";
      const text = `${titleText} ${abstractText}`.toLowerCase();
      const keywordHits = queryTerms.filter((term) => text.includes(term)).length;
      const keywordCoverage = queryTerms.length ? keywordHits / queryTerms.length : 0;
      const semanticRelevance = jaccard(tokenize(text), queryTerms);
      const recencyScore = doc.year ? Math.max(0, 1 - Math.min(15, now - doc.year) / 15) : 0.2;
      const credibility = sourceCredibility[doc.sourceType] ?? 0.75;
      const trialPriorityBoost = doc.sourceType === "clinicaltrials" && /recruit/i.test(doc.trialStatus ?? "") ? 1 : 0;
      const diseaseMatch = diseaseHint.some((token) => text.includes(token)) ? 1 : 0;
      const trialMismatchPenalty =
        doc.sourceType === "clinicaltrials" && diseaseMatch === 0
          ? 0.25
          : 0;

      const total =
        0.5 * semanticRelevance +
        0.2 * keywordCoverage +
        0.15 * recencyScore +
        0.1 * credibility +
        0.05 * trialPriorityBoost -
        trialMismatchPenalty;

      return {
        ...doc,
        scoreBreakdown: {
          semanticRelevance,
          keywordCoverage,
          recencyScore,
          sourceCredibility: credibility,
          trialPriorityBoost,
          diseaseMatch,
          trialMismatchPenalty,
          total,
        },
      };
    })
    .sort((a, b) => (b.scoreBreakdown?.total ?? 0) - (a.scoreBreakdown?.total ?? 0));

  const top = scored.slice(0, topK);
  const hasTrial = top.some((doc) => doc.sourceType === "clinicaltrials");
  if (!hasTrial) {
    const fallbackTrial = scored.find((doc) => doc.sourceType === "clinicaltrials");
    if (fallbackTrial && top.length > 0) top[top.length - 1] = fallbackTrial;
  }
  return top;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function jaccard(aTokens: string[], bTokens: string[]): number {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
