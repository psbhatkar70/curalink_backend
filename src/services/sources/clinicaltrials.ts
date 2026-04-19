import axios from "axios";
import type { StandardDoc } from "../../types.js";

interface TrialsResponse {
  studies?: Array<{
    protocolSection?: {
      identificationModule?: { nctId?: string; briefTitle?: string };
      descriptionModule?: { briefSummary?: string };
      statusModule?: { overallStatus?: string };
      contactsLocationsModule?: {
        centralContacts?: Array<{ name?: string; phone?: string; email?: string }>;
        locationList?: {
          location?: Array<{ locationCity?: string; locationCountry?: string }>;
        };
      };
      eligibilityModule?: { eligibilityCriteria?: string };
    };
  }>;
}

export async function fetchClinicalTrials(disease: string, status = "RECRUITING", pageSize = 50): Promise<StandardDoc[]> {
  const { data } = await axios.get<TrialsResponse>("https://clinicaltrials.gov/api/v2/studies", {
    params: {
      "query.cond": disease,
      "filter.overallStatus": status,
      pageSize,
      format: "json",
    },
    timeout: 25000,
  });

  return (data.studies ?? []).map((study): StandardDoc => {
    const module = study.protocolSection;
    const id = module?.identificationModule?.nctId ?? `nct-${Math.random()}`;
    const title = module?.identificationModule?.briefTitle ?? "Untitled Trial";
    const abstract = module?.descriptionModule?.briefSummary ?? "";
    const statusValue = module?.statusModule?.overallStatus ?? "UNKNOWN";
    const locations = module?.contactsLocationsModule?.locationList?.location?.map((l) =>
      [l.locationCity, l.locationCountry].filter(Boolean).join(", ")
    ) ?? [];
    const contactEntry = module?.contactsLocationsModule?.centralContacts?.[0];
    const contact = [contactEntry?.name, contactEntry?.phone, contactEntry?.email].filter(Boolean).join(" | ");

    return {
      id: `clinicaltrials:${id}`,
      sourceType: "clinicaltrials",
      title,
      abstract,
      authors: [],
      url: `https://clinicaltrials.gov/study/${id}`,
      snippet: abstract.slice(0, 280),
      trialStatus: statusValue,
      eligibility: module?.eligibilityModule?.eligibilityCriteria ?? "",
      locations,
      contact,
    };
  });
}
