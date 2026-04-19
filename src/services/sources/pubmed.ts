import axios from "axios";
import { parseStringPromise } from "xml2js";
import type { StandardDoc } from "../../types.js";

interface ESearchResponse {
  esearchresult?: { idlist?: string[] };
}

export async function fetchPubMed(query: string, retmax = 50): Promise<StandardDoc[]> {
  const ids = await searchIds(query, retmax);
  if (ids.length === 0) return [];
  const xml = await fetchDetails(ids);
  return parsePubMedXml(xml);
}

async function searchIds(query: string, retmax: number): Promise<string[]> {
  const { data } = await axios.get<ESearchResponse>("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", {
    params: { db: "pubmed", term: query, retmax, sort: "pub+date", retmode: "json" },
    timeout: 20000,
  });
  return data.esearchresult?.idlist ?? [];
}

async function fetchDetails(ids: string[]): Promise<string> {
  const { data } = await axios.get<string>("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", {
    params: { db: "pubmed", id: ids.join(","), retmode: "xml" },
    timeout: 25000,
  });
  return data;
}

async function parsePubMedXml(xml: string): Promise<StandardDoc[]> {
  const parsed = await parseStringPromise(xml, { explicitArray: true });
  const articles = parsed?.PubmedArticleSet?.PubmedArticle ?? [];
  return articles.map((article: any): StandardDoc => {
    const citation = article?.MedlineCitation?.[0];
    const articleData = citation?.Article?.[0];
    const pmid = citation?.PMID?.[0]?._ ?? citation?.PMID?.[0];
    const title = articleData?.ArticleTitle?.[0] ?? "Untitled";
    const abstractPieces = articleData?.Abstract?.[0]?.AbstractText ?? [];
    const abstract = abstractPieces.map((x: any) => (typeof x === "string" ? x : x._ ?? "")).join(" ");
    const yearRaw = articleData?.Journal?.[0]?.JournalIssue?.[0]?.PubDate?.[0]?.Year?.[0];
    const year = yearRaw ? Number(yearRaw) : undefined;
    const authors = (articleData?.AuthorList?.[0]?.Author ?? [])
      .map((a: any) => [a?.ForeName?.[0], a?.LastName?.[0]].filter(Boolean).join(" "))
      .filter(Boolean);

    return {
      id: `pubmed:${pmid}`,
      sourceType: "pubmed",
      title,
      abstract,
      authors,
      year,
      url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
      snippet: abstract.slice(0, 280),
    };
  });
}
