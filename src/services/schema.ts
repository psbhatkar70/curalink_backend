import { z } from "zod";

export const llmResponseSchema = z.object({
  conditionOverview: z.string().min(1),
  researchInsights: z.array(
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      keyFinding: z.string().min(1),
      sourceId: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
  clinicalTrials: z.array(
    z.object({
      title: z.string().min(1),
      recruitingStatus: z.string().min(1),
      eligibilityCriteria: z.string().min(1),
      location: z.string().min(1),
      contactInformation: z.string().min(1),
      sourceId: z.string().min(1),
    })
  ),
  sources: z.array(
    z.object({
      sourceId: z.string().min(1),
      title: z.string().min(1),
      authors: z.array(z.string()),
      year: z.number().optional(),
      platform: z.string().min(1),
      url: z.string().optional(),
      supportingSnippet: z.string().min(1),
    })
  ),
  followUpSuggestions: z.array(z.string().min(1)),
  safetyDisclaimer: z.string().min(1),
});
