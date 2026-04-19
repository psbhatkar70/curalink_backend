import type { SearchInput, StandardDoc } from "../types.js";

export function buildPrompt(
  input: SearchInput,
  docs: StandardDoc[],
  expandedQueries: string[],
  historyTurns: Array<{ input: SearchInput }>
): string {
  const previousConversation = historyTurns
    .map((turn, index) =>
      `Turn ${index + 1}: Disease=${turn.input.disease || "Unknown"}; Query=${turn.input.query}; Location=${turn.input.location || "Unknown"}`
    )
    .join("\n");

  const context = docs
    .map((doc) => `
Source ID: ${doc.id}
Type: ${doc.sourceType}
Title: ${doc.title}
Abstract: ${doc.abstract ? doc.abstract.slice(0, 300) + (doc.abstract.length > 300 ? "..." : "") : ""}
Authors: ${doc.authors || "Unknown"}
Year: ${doc.year || "Unknown"}
URL: ${doc.url || "N/A"}
${doc.trialStatus ? `Trial Status: ${doc.trialStatus}` : ""}
${doc.eligibility ? `Eligibility: ${doc.eligibility.slice(0, 100)}...` : ""}
${doc.locations ? `Locations: ${doc.locations.slice(0, 100)}...` : ""}
Snippet: ${doc.snippet || ""}
    `.trim())
    .join("\n\n---\n\n");

  return `
You are Curalink, a medical research assistant.
Rules:
1) Use only provided evidence context.
2) Never invent citations.
3) Mark uncertainty and say when evidence is absent.
4) Include a non-diagnostic safety disclaimer.
5) Return strict JSON.
6) If a claim cannot be supported by the provided docs, say so clearly.

User profile:
- Patient name: ${input.patientName ?? "Unknown"}
- Disease: ${input.disease}
- Query: ${input.query}
- Location: ${input.location ?? "Unknown"}
- Expanded queries: ${expandedQueries.join(" | ")}
${previousConversation ? `
Previous conversation:
${previousConversation}
` : ""}
Context docs:
${context}

JSON format:
{
  "conditionOverview": "string",
  "researchInsights": [{"title":"string","summary":"string","keyFinding":"string","sourceId":"string"}],
  "clinicalTrials": [{"title":"string","recruitingStatus":"string","eligibilityCriteria":"string","location":"string","contactInformation":"string","sourceId":"string"}],
  "sources": [{"sourceId":"string","title":"string","authors":["string"],"year":2024,"platform":"string","url":"string","supportingSnippet":"string"}],
  "followUpSuggestions": ["string"],
  "safetyDisclaimer": "string"
}

Output only the JSON object, nothing else.
`.trim();
}
