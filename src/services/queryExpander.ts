import type { SearchInput } from "../types.js";

export function expandQuery(input: SearchInput, historyTurns: Array<{ input: SearchInput }>): string[] {
  const disease = clean(input.disease);
  const normalizedDisease = compareKey(input.disease);
  const parts = [input.query, disease].filter(Boolean);
  const base = parts.join(" ");
  const location = input.location ? `${base} ${input.location}` : base;

  const historyQueries = dedupe(
    historyTurns
      .slice(-3)
      .map((turn) => clean(turn.input.query))
      .filter(Boolean)
  );

  const withContext = historyQueries.length > 0 ? `${base} ${historyQueries.join(" ")}` : base;
  const contextDiseases = dedupe(
    historyTurns.map((turn) => turn.input.disease)
  ).filter((historyDisease) => compareKey(historyDisease) !== normalizedDisease);
  const withPastDiseases = contextDiseases.length > 0 ? `${base} ${contextDiseases.join(" ")}` : base;
  const trialIntent = `${disease} ${input.query} clinical trial`;
  return dedupe([base, location, withContext, withPastDiseases, trialIntent]).slice(0, 4);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean))];
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function compareKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
