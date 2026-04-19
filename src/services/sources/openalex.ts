import axios from "axios";
import type { StandardDoc } from "../../types.js";

interface OpenAlexResponse {
  results?: Array<{
    id?: string;
    display_name?: string;
    publication_year?: number;
    primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
    authorships?: Array<{ author?: { display_name?: string } }>;
    abstract_inverted_index?: Record<string, number[]>;
  }>;
}

export async function fetchOpenAlex(query: string, perPage = 50): Promise<StandardDoc[]> {
  const { data } = await axios.get<OpenAlexResponse>("https://api.openalex.org/works", {
    params: {
      search: query,
      "per-page": perPage,
      page: 1,
      sort: "relevance_score:desc",
    },
    timeout: 20000,
  });

  return (data.results ?? []).map((item): StandardDoc => {
    const abstract = rebuildInvertedAbstract(item.abstract_inverted_index ?? {});
    return {
      id: item.id ?? `openalex-${Math.random()}`,
      sourceType: "openalex",
      title: item.display_name ?? "Untitled",
      abstract,
      authors: (item.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
      year: item.publication_year,
      url: item.primary_location?.landing_page_url,
      snippet: abstract.slice(0, 280),
    };
  });
}

function rebuildInvertedAbstract(index: Record<string, number[]>): string {
  const terms: Array<{ pos: number; token: string }> = [];
  for (const [token, positions] of Object.entries(index)) {
    for (const pos of positions) terms.push({ pos, token });
  }
  return terms.sort((a, b) => a.pos - b.pos).map((entry) => entry.token).join(" ");
}
