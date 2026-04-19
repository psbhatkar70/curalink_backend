import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { getDb } from "../db/mongo.js";
import { appendSessionTurn, getRecentTurns, readCache, writeCache, writeTelemetry } from "../db/repositories.js";
import { hashQuery } from "../utils/hash.js";
import { expandQuery } from "../services/queryExpander.js";
import { deepRetrieve } from "../services/retrieval.js";
import { rerankDocs } from "../services/rerank.js";
import { buildPrompt } from "../services/prompt.js";
import { generateStructuredAnswer } from "../services/llm.js";
import { postprocessStructuredAnswer } from "../services/responsePostprocess.js";
import type { SearchInput } from "../types.js";

const requestSchema = z.object({
  sessionId: z.string().min(1).optional(),
  patientName: z.string().optional(),
  disease: z.string().min(2),
  query: z.string().min(2),
  location: z.string().optional(),
});

export const researchRouter = Router();

researchRouter.post("/", async (req, res) => {
  const start = Date.now();
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const input = parsed.data as SearchInput;
  const db = await getDb();
  const sessionId = input.sessionId ?? `session-${Date.now()}`;
  const history = await getRecentTurns(db, sessionId);

  const expanded = expandQuery(input, history);
  const cacheKey = hashQuery(`${expanded.join("|")}|${input.location ?? ""}`);
  const cached = await readCache(db, cacheKey);

  let docs = cached?.docs ?? [];
  let sourceCounts = cached?.sourceCounts ?? { pubmed: 0, openalex: 0, clinicaltrials: 0 };
  let totalCandidates = cached?.totalCandidates ?? 0;
  const cacheHit = Boolean(cached);
  let retrievalError: string | null = null;

  if (!cacheHit) {
    try {
      const retrieved = await deepRetrieve(expanded, input.disease);
      totalCandidates = retrieved.totalCandidates;
      sourceCounts = retrieved.sourceCounts;
      docs = rerankDocs(retrieved.docs, `${input.disease} ${input.query}`, 6);
      await writeCache(
        db,
        cacheKey,
        { docs, sourceCounts, totalCandidates },
        config.cacheTtlSeconds
      );
    } catch (error) {
      retrievalError = error instanceof Error ? error.message : "Retrieval failed";
    }
  }

  if (docs.length === 0) {
    return res.status(502).json({
      error: "No research documents were retrieved. Try a broader query.",
      retrievalError,
      cacheHit,
      expandedQueries: expanded,
    });
  }

  const prompt = buildPrompt(input, docs, expanded, history);
  let response: any;
  let retryCount = 0;
  const maxRetries = 2;
  while (retryCount <= maxRetries) {
    try {
      const currentPrompt = retryCount === 0 ? prompt : `${prompt}\nReturn only valid JSON with no markdown fences or extra text. Ensure all arrays are properly closed.`;
      response = await generateStructuredAnswer(currentPrompt);
      break; // Success, exit loop
    } catch (error) {
      retryCount++;
      if (retryCount > maxRetries) {
        throw error; // Re-throw after max retries
      }
      console.warn(`LLM generation failed (attempt ${retryCount}), retrying...`);
    }
  }

  response = {
    ...response,
    safetyDisclaimer:
      response.safetyDisclaimer ||
      "This information is research-oriented and not a medical diagnosis. Consult a licensed clinician.",
  };
  response = postprocessStructuredAnswer(response, docs);

  await appendSessionTurn(db, sessionId, input, response);

  const elapsedMs = Date.now() - start;
  await writeTelemetry(db, {
    sessionId,
    cacheHit,
    totalCandidates,
    topK: docs.length,
    sourceCounts,
    warningCount: [retrievalError].filter(Boolean).length,
    trialDocsInTopK: docs.filter((doc) => doc.sourceType === "clinicaltrials").length,
    elapsedMs,
  });

  return res.json({
    sessionId,
    cacheHit,
    expandedQueries: expanded,
    retrieval: { totalCandidates, sourceCounts },
    rankedDocs: docs,
    answer: response,
    warnings: [retrievalError].filter(Boolean),
    timings: { elapsedMs },
  });
});
