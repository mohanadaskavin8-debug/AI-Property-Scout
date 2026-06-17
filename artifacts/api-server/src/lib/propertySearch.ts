import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface ParsedFilters {
  location: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  propertyType: string | null;
  minSqft: number | null;
  maxSqft: number | null;
  keywords: string[];
}

export interface PropertyResult {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  propertyType: string;
  yearBuilt: number | null;
  description: string | null;
  photos: string[];
  lat: number | null;
  lng: number | null;
  mlsId: string | null;
  listingUrl: string | null;
  daysOnMarket: number | null;
  pricePerSqft: number | null;
  source: string;
  matchScore: number | null;
  geocodeStatus?: "ok" | "pending" | "failed";
}

export async function parsePromptToFilters(prompt: string): Promise<ParsedFilters> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content: `You are a real estate search assistant. Extract structured search filters from the user's natural language query.
Return a JSON object with these fields:
- location: string or null (city, state, zip, or neighborhood)
- minPrice: number or null
- maxPrice: number or null  
- minBedrooms: integer or null
- minBathrooms: number or null
- propertyType: "house", "condo", "townhouse", "apartment", "land", or null
- minSqft: integer or null
- maxSqft: integer or null
- keywords: array of important descriptive keywords (e.g. ["pool", "garage", "mountain view", "modern", "renovated"])

Return ONLY valid JSON, no explanation.`,
      },
      { role: "user", content: prompt },
    ],
  });

  try {
    const content = response.choices[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as ParsedFilters;
  } catch {
    logger.warn({ prompt }, "Failed to parse filters from AI response");
    return {
      location: null,
      minPrice: null,
      maxPrice: null,
      minBedrooms: null,
      minBathrooms: null,
      propertyType: null,
      minSqft: null,
      maxSqft: null,
      keywords: [],
    };
  }
}

export async function generateSearchSummary(
  prompt: string,
  filters: ParsedFilters,
  count: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 256,
    messages: [
      {
        role: "system",
        content:
          "Write a brief, elegant 1-2 sentence summary of what the AI found based on the search. Be specific about the criteria matched. Professional tone.",
      },
      {
        role: "user",
        content: `Search prompt: "${prompt}"\nFilters applied: ${JSON.stringify(filters)}\nResults found: ${count}`,
      },
    ],
  });
  return response.choices[0]?.message?.content ?? `Found ${count} properties matching your search.`;
}

export function scoreProperties(
  properties: PropertyResult[],
  filters: ParsedFilters
): PropertyResult[] {
  return properties
    .map((p) => {
      let score = 50;
      if (filters.minBedrooms && p.bedrooms) {
        score += p.bedrooms >= filters.minBedrooms ? 15 : -20;
      }
      if (filters.maxPrice && p.price <= filters.maxPrice) score += 10;
      if (filters.minPrice && p.price >= filters.minPrice) score += 5;
      if (filters.propertyType && p.propertyType === filters.propertyType) score += 10;
      if (filters.keywords?.length) {
        const desc = (p.description ?? "").toLowerCase();
        const matched = filters.keywords.filter((k) => desc.includes(k.toLowerCase())).length;
        score += matched * 5;
      }
      return { ...p, matchScore: Math.min(100, Math.max(0, score)) };
    })
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}
