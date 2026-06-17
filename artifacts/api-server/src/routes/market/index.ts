import { Router, type IRouter } from "express";
import { GetMarketInsightsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const MARKET_DATA: Record<string, object> = {
  "san francisco": {
    location: "San Francisco, CA",
    averagePrice: 1284000,
    medianPrice: 1150000,
    activeListings: 847,
    avgDaysOnMarket: 21,
    pricePerSqft: 987,
    priceChangePercent: 3.2,
    hotNeighborhoods: ["Noe Valley", "Mission District", "Pacific Heights", "SOMA", "Bernal Heights"],
  },
  "new york": {
    location: "New York, NY",
    averagePrice: 1540000,
    medianPrice: 980000,
    activeListings: 4231,
    avgDaysOnMarket: 45,
    pricePerSqft: 1124,
    priceChangePercent: 1.8,
    hotNeighborhoods: ["Brooklyn Heights", "Williamsburg", "Astoria", "Upper West Side", "Tribeca"],
  },
  "austin": {
    location: "Austin, TX",
    averagePrice: 624000,
    medianPrice: 549000,
    activeListings: 2150,
    avgDaysOnMarket: 38,
    pricePerSqft: 312,
    priceChangePercent: -2.1,
    hotNeighborhoods: ["South Congress", "East Austin", "Travis Heights", "Hyde Park", "Mueller"],
  },
  "miami": {
    location: "Miami, FL",
    averagePrice: 892000,
    medianPrice: 695000,
    activeListings: 3105,
    avgDaysOnMarket: 52,
    pricePerSqft: 524,
    priceChangePercent: 5.7,
    hotNeighborhoods: ["Brickell", "Wynwood", "Coconut Grove", "Coral Gables", "South Beach"],
  },
  "los angeles": {
    location: "Los Angeles, CA",
    averagePrice: 1024000,
    medianPrice: 875000,
    activeListings: 6342,
    avgDaysOnMarket: 33,
    pricePerSqft: 698,
    priceChangePercent: 2.4,
    hotNeighborhoods: ["Silver Lake", "Los Feliz", "Venice", "Santa Monica", "Highland Park"],
  },
  "seattle": {
    location: "Seattle, WA",
    averagePrice: 892000,
    medianPrice: 785000,
    activeListings: 1842,
    avgDaysOnMarket: 15,
    pricePerSqft: 512,
    priceChangePercent: 4.1,
    hotNeighborhoods: ["Capitol Hill", "Ballard", "Fremont", "Queen Anne", "Columbia City"],
  },
  "denver": {
    location: "Denver, CO",
    averagePrice: 712000,
    medianPrice: 624000,
    activeListings: 2180,
    avgDaysOnMarket: 28,
    pricePerSqft: 398,
    priceChangePercent: 1.2,
    hotNeighborhoods: ["RiNo", "Capitol Hill", "Highlands", "Washington Park", "LoDo"],
  },
};

const DEFAULT_MARKET = {
  location: "United States",
  averagePrice: 428700,
  medianPrice: 379900,
  activeListings: 1185000,
  avgDaysOnMarket: 42,
  pricePerSqft: 254,
  priceChangePercent: 1.9,
  hotNeighborhoods: ["Sunbelt Cities", "Mountain West", "Southeast Coast", "Pacific Northwest"],
};

router.get("/market/insights", async (req, res): Promise<void> => {
  const params = GetMarketInsightsQueryParams.safeParse(req.query);
  const location = params.success ? (params.data.location ?? "") : "";

  const locLower = location.toLowerCase();
  let data = DEFAULT_MARKET;

  for (const [key, val] of Object.entries(MARKET_DATA)) {
    if (locLower.includes(key)) {
      data = val as typeof DEFAULT_MARKET;
      break;
    }
  }

  res.json(data);
});

export default router;
