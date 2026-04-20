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

CRITICAL INSTRUCTIONS FOR JSON OUTPUT:
1. Return ONLY valid JSON. Do not add any text before or after.
2. Escape all quotes inside string values with backslash: \"
3. Replace newlines in strings with spaces.
4. Use double quotes for all strings and keys.
5. Ensure all arrays and objects are properly closed.
6. Never include markdown, code blocks, or explanations.

JSON format (must be EXACT):
{
  "conditionOverview": "brief summary of the condition",
  "researchInsights": [
    {"title":"paper title","summary":"key findings","keyFinding":"most important result","sourceId":"source_id"}
  ],
  "clinicalTrials": [
    {"title":"trial name","recruitingStatus":"status","eligibilityCriteria":"criteria","location":"location","contactInformation":"contact","sourceId":"source_id"}
  ],
  "sources": [
    {"sourceId":"id","title":"title","authors":["author1","author2"],"year":2024,"platform":"platform","url":"url","supportingSnippet":"snippet"}
  ],
  "followUpSuggestions": ["question1","question2","question3"],
  "safetyDisclaimer": "This is not medical advice. Consult a healthcare provider."
}

Output only the JSON object, nothing else. No markdown. No code blocks. No text before or after.
`.trim();
}
