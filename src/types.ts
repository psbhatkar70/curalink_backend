export type SourceType = "pubmed" | "openalex" | "clinicaltrials";

export interface SearchInput {
  sessionId?: string;
  patientName?: string;
  disease: string;
  query: string;
  location?: string;
}

export interface StandardDoc {
  id: string;
  sourceType: SourceType;
  title: string;
  abstract: string;
  authors: string[];
  year?: number;
  url?: string;
  snippet: string;
  trialStatus?: string;
  eligibility?: string;
  locations?: string[];
  contact?: string;
  scoreBreakdown?: {
    semanticRelevance: number;
    keywordCoverage: number;
    recencyScore: number;
    sourceCredibility: number;
    trialPriorityBoost: number;
    diseaseMatch?: number;
    trialMismatchPenalty?: number;
    total: number;
  };
}

export interface RankedBundle {
  docs: StandardDoc[];
  totalCandidates: number;
  sourceCounts: Record<SourceType, number>;
}

export interface ClinicalTrialAnswer {
  title: string;
  recruitingStatus: string;
  eligibilityCriteria: string;
  location: string;
  contactInformation: string;
  sourceId: string;
}

export interface ResearchInsight {
  title: string;
  summary: string;
  keyFinding: string;
  sourceId: string;
  confidence?: number;
}

export interface LLMStructuredResponse {
  conditionOverview: string;
  researchInsights: ResearchInsight[];
  clinicalTrials: ClinicalTrialAnswer[];
  sources: Array<{
    sourceId: string;
    title: string;
    authors: string[];
    year?: number;
    platform: string;
    url?: string;
    supportingSnippet: string;
  }>;
  followUpSuggestions: string[];
  safetyDisclaimer: string;
}
