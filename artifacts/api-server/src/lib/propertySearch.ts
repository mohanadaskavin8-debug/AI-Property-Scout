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

interface ZillowSearchResult {
  zpid: number;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  homeType?: string;
  yearBuilt?: number;
  description?: string;
  imgSrc?: string;
  latitude?: number;
  longitude?: number;
  daysOnZillow?: number;
  priceReduction?: number;
  url?: string;
}

export async function searchZillow(
  filters: ParsedFilters,
  maxResults = 20
): Promise<PropertyResult[]> {
  const location = filters.location ?? "United States";

  const searchQueryState = {
    pagination: {},
    isMapVisible: true,
    mapBounds: {},
    filterState: {
      ...(filters.minPrice ? { price: { min: filters.minPrice } } : {}),
      ...(filters.maxPrice ? { price: { max: filters.maxPrice } } : { price: {} }),
      ...(filters.minBedrooms ? { beds: { min: filters.minBedrooms } } : {}),
      ...(filters.minBathrooms ? { baths: { min: Math.ceil(filters.minBathrooms) } } : {}),
      ...(filters.minSqft ? { sqft: { min: filters.minSqft } } : {}),
      ...(filters.maxSqft ? { sqft: { max: filters.maxSqft } } : {}),
      sortSelection: { value: "globalrelevanceex" },
      isAllHomes: { value: true },
    },
    isListVisible: true,
    mapZoom: 12,
    usersSearchTerm: location,
  };

  const wants = { cat1: ["listResults", "mapResults"], cat2: ["total"] };
  const url = `https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState=${encodeURIComponent(JSON.stringify(searchQueryState))}&wants=${encodeURIComponent(JSON.stringify(wants))}&requestId=1`;

  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.zillow.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, location }, "Zillow search returned non-200");
      return [];
    }

    const data = (await res.json()) as {
      cat1?: { searchResults?: { listResults?: ZillowSearchResult[] } };
    };
    const listings: ZillowSearchResult[] =
      data?.cat1?.searchResults?.listResults ?? [];

    return listings.slice(0, maxResults).map((item) => mapZillowToProperty(item));
  } catch (err) {
    logger.error({ err, location }, "Error fetching from Zillow");
    return [];
  }
}

function mapZillowToProperty(item: ZillowSearchResult): PropertyResult {
  const price = item.price ?? 0;
  const sqft = item.livingArea ?? null;
  return {
    id: `zillow-${item.zpid}`,
    address: item.streetAddress ?? "Unknown Address",
    city: item.city ?? "",
    state: item.state ?? "",
    zipCode: item.zipcode ?? "",
    price,
    bedrooms: item.bedrooms ?? null,
    bathrooms: item.bathrooms ?? null,
    sqft,
    propertyType: normalizePropertyType(item.homeType),
    yearBuilt: item.yearBuilt ?? null,
    description: item.description ?? null,
    photos: item.imgSrc ? [item.imgSrc] : [],
    lat: item.latitude ?? null,
    lng: item.longitude ?? null,
    mlsId: String(item.zpid),
    listingUrl: item.url ? `https://www.zillow.com${item.url}` : `https://www.zillow.com/homedetails/${item.zpid}_zpid/`,
    daysOnMarket: item.daysOnZillow ?? null,
    pricePerSqft: sqft && price ? Math.round(price / sqft) : null,
    source: "Zillow",
    matchScore: null,
  };
}

function normalizePropertyType(homeType?: string): string {
  const t = (homeType ?? "").toLowerCase();
  if (t.includes("condo") || t.includes("apartment")) return "condo";
  if (t.includes("townhouse") || t.includes("townhome")) return "townhouse";
  if (t.includes("land") || t.includes("lot")) return "land";
  return "house";
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

const HOUSE_PHOTOS = [
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1626178793926-22b28830aa30?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800&q=80&fit=crop",
  "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800&q=80&fit=crop",
];

export function getSampleProperties(location: string, count = 12): PropertyResult[] {
  const cities = [
    { city: "San Francisco", state: "CA", zip: "94105", lat: 37.7749, lng: -122.4194 },
    { city: "Los Angeles", state: "CA", zip: "90001", lat: 34.0522, lng: -118.2437 },
    { city: "New York", state: "NY", zip: "10001", lat: 40.7128, lng: -74.006 },
    { city: "Austin", state: "TX", zip: "78701", lat: 30.2672, lng: -97.7431 },
    { city: "Miami", state: "FL", zip: "33101", lat: 25.7617, lng: -80.1918 },
    { city: "Seattle", state: "WA", zip: "98101", lat: 47.6062, lng: -122.3321 },
    { city: "Denver", state: "CO", zip: "80201", lat: 39.7392, lng: -104.9903 },
    { city: "Chicago", state: "IL", zip: "60601", lat: 41.8781, lng: -87.6298 },
  ];

  const locLower = location.toLowerCase();
  const matched = cities.find((c) =>
    locLower.includes(c.city.toLowerCase()) || locLower.includes(c.state.toLowerCase())
  ) ?? cities[0];

  const types = ["house", "condo", "townhouse"];
  const streets = [
    "Oak", "Maple", "Cedar", "Willow", "Pine", "Elm", "Birch", "Walnut", "Cherry", "Spruce",
    "Market", "Mission", "Valencia", "Fillmore", "Divisadero",
  ];

  return Array.from({ length: count }, (_, i) => {
    const price = 400000 + Math.floor(Math.random() * 2000000);
    const sqft = 800 + Math.floor(Math.random() * 3000);
    const beds = 1 + Math.floor(Math.random() * 5);
    const baths = 1 + Math.floor(Math.random() * 4);
    const type = types[i % 3];
    const street = streets[i % streets.length];

    return {
      id: `sample-${i + 1}`,
      address: `${100 + i * 7} ${street} St`,
      city: matched.city,
      state: matched.state,
      zipCode: matched.zip,
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft,
      propertyType: type,
      yearBuilt: 1980 + Math.floor(Math.random() * 44),
      description: `Beautiful ${type} in the heart of ${matched.city}. Featuring ${beds} bedrooms and ${baths} bathrooms with ${sqft.toLocaleString()} square feet of living space. Modern finishes throughout.`,
      photos: [HOUSE_PHOTOS[i % HOUSE_PHOTOS.length]],
      lat: matched.lat + (Math.random() - 0.5) * 0.05,
      lng: matched.lng + (Math.random() - 0.5) * 0.05,
      mlsId: `MLS${100000 + i}`,
      listingUrl: null,
      daysOnMarket: Math.floor(Math.random() * 90),
      pricePerSqft: Math.round(price / sqft),
      source: "Sample MLS",
      matchScore: 70 + Math.floor(Math.random() * 30),
    };
  });
}
