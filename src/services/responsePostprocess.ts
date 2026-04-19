import type { LLMStructuredResponse, StandardDoc } from "../types.js";

export function postprocessStructuredAnswer(
  response: LLMStructuredResponse,
  rankedDocs: StandardDoc[]
): LLMStructuredResponse {
  const docMap = new Map(rankedDocs.map((doc) => [doc.id, doc]));

  let normalizedInsights = response.researchInsights
    .filter((insight) => docMap.has(insight.sourceId))
    .map((insight) => {
      const doc = docMap.get(insight.sourceId)!;
      return {
        ...insight,
        confidence: normalizeConfidence(doc.scoreBreakdown?.total),
      };
    })
    .slice(0, 6);

  if (normalizedInsights.length < 3) {
    const existingIds = new Set(normalizedInsights.map((item) => item.sourceId));
    const fallbackCandidates = rankedDocs
      .filter((doc) => doc.sourceType !== "clinicaltrials" && !existingIds.has(doc.id))
      .slice(0, 6);
    for (const doc of fallbackCandidates) {
      normalizedInsights.push({
        title: doc.title,
        summary: doc.abstract || doc.snippet || "Summary unavailable from source.",
        keyFinding: doc.snippet || (doc.abstract ? doc.abstract.slice(0, 220) : "Key finding unavailable."),
        sourceId: doc.id,
        confidence: normalizeConfidence(doc.scoreBreakdown?.total),
      });
      if (normalizedInsights.length >= 3) break;
    }
  }

  let normalizedTrials = response.clinicalTrials
    .filter((trial) => {
      const doc = docMap.get(trial.sourceId);
      return doc?.sourceType === "clinicaltrials";
    })
    .map((trial) => {
      const doc = docMap.get(trial.sourceId)!;
      return {
        title: doc.title,
        recruitingStatus: doc.trialStatus ?? trial.recruitingStatus,
        eligibilityCriteria: doc.eligibility || trial.eligibilityCriteria || "Not specified",
        location: doc.locations?.[0] ?? trial.location ?? "Not specified",
        contactInformation: doc.contact || trial.contactInformation || "Not specified",
        sourceId: doc.id,
      };
    })
    .slice(0, 4);

  if (normalizedTrials.length === 0) {
    const bestTrialDoc = rankedDocs.find((doc) => doc.sourceType === "clinicaltrials");
    if (bestTrialDoc) {
      normalizedTrials = [
        {
          title: bestTrialDoc.title,
          recruitingStatus: bestTrialDoc.trialStatus ?? "UNKNOWN",
          eligibilityCriteria: bestTrialDoc.eligibility || "Not specified",
          location: bestTrialDoc.locations?.[0] ?? "Not specified",
          contactInformation: bestTrialDoc.contact || "Not specified",
          sourceId: bestTrialDoc.id,
        },
      ];
    }
  }

  const normalizedSources = response.sources
    .filter((source) => docMap.has(source.sourceId))
    .map((source) => {
      const doc = docMap.get(source.sourceId)!;
      return {
        sourceId: doc.id,
        title: doc.title,
        authors: doc.authors,
        year: doc.year,
        platform: doc.sourceType,
        url: doc.url,
        supportingSnippet: doc.snippet || source.supportingSnippet || doc.abstract.slice(0, 280),
      };
    });

  const uniqueSourceMap = new Map(normalizedSources.map((item) => [item.sourceId, item]));

  for (const insight of normalizedInsights) {
    if (!uniqueSourceMap.has(insight.sourceId)) {
      const doc = docMap.get(insight.sourceId);
      if (!doc) continue;
      uniqueSourceMap.set(insight.sourceId, {
        sourceId: doc.id,
        title: doc.title,
        authors: doc.authors,
        year: doc.year,
        platform: doc.sourceType,
        url: doc.url,
        supportingSnippet: doc.snippet || doc.abstract.slice(0, 280),
      });
    }
  }

  for (const trial of normalizedTrials) {
    if (!uniqueSourceMap.has(trial.sourceId)) {
      const doc = docMap.get(trial.sourceId);
      if (!doc) continue;
      uniqueSourceMap.set(trial.sourceId, {
        sourceId: doc.id,
        title: doc.title,
        authors: doc.authors,
        year: doc.year,
        platform: doc.sourceType,
        url: doc.url,
        supportingSnippet: doc.snippet || doc.abstract.slice(0, 280),
      });
    }
  }

  return {
    ...response,
    researchInsights: normalizedInsights,
    clinicalTrials: normalizedTrials,
    sources: [...uniqueSourceMap.values()].slice(0, 10),
  };
}

function normalizeConfidence(score: number | undefined): number {
  if (!score || Number.isNaN(score)) return 0.5;
  return Math.max(0, Math.min(1, score));
}
