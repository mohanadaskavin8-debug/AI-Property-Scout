import { Layout } from "@/components/Layout";
import { useGetMarketInsights } from "@workspace/api-client-react";
import { TrendingUp, Activity, Home, DollarSign } from "lucide-react";

export default function Market() {
  // Hardcoded for MVP
  const location = "Denver, CO";
  const { data: insights, isLoading } = useGetMarketInsights({ location });

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-8 py-20">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4 flex items-center gap-4">
            <TrendingUp className="text-primary" size={40} />
            Market Insights
          </h1>
          <p className="text-white/50 text-lg">Data-driven analysis for {location}.</p>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center min-h-[40vh]">
            <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
          </div>
        ) : insights ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="glass-panel p-6 rounded-2xl">
                <div className="flex items-center gap-3 text-white/50 mb-4">
                  <DollarSign size={20} />
                  <span className="uppercase tracking-wider text-xs font-semibold">Average Price</span>
                </div>
                <div className="text-3xl font-bold text-white mb-2">
                  ${insights.averagePrice.toLocaleString()}
                </div>
                <div className={`text-sm ${insights.priceChangePercent > 0 ? "text-green-400" : "text-red-400"}`}>
                  {insights.priceChangePercent > 0 ? "+" : ""}{insights.priceChangePercent}% YoY
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl">
                <div className="flex items-center gap-3 text-white/50 mb-4">
                  <Home size={20} />
                  <span className="uppercase tracking-wider text-xs font-semibold">Active Listings</span>
                </div>
                <div className="text-3xl font-bold text-white mb-2">
                  {insights.activeListings.toLocaleString()}
                </div>
                <div className="text-sm text-white/40">Available properties</div>
              </div>

              <div className="glass-panel p-6 rounded-2xl">
                <div className="flex items-center gap-3 text-white/50 mb-4">
                  <Activity size={20} />
                  <span className="uppercase tracking-wider text-xs font-semibold">Avg Days on Market</span>
                </div>
                <div className="text-3xl font-bold text-white mb-2">
                  {insights.avgDaysOnMarket}
                </div>
                <div className="text-sm text-white/40">Market velocity</div>
              </div>

              <div className="glass-panel p-6 rounded-2xl">
                <div className="flex items-center gap-3 text-white/50 mb-4">
                  <DollarSign size={20} />
                  <span className="uppercase tracking-wider text-xs font-semibold">Price per SqFt</span>
                </div>
                <div className="text-3xl font-bold text-white mb-2">
                  ${insights.pricePerSqft}
                </div>
                <div className="text-sm text-white/40">Average value</div>
              </div>
            </div>

            <div className="glass-panel p-8 rounded-3xl mt-12">
              <h3 className="text-2xl font-serif font-bold mb-6">Hot Neighborhoods</h3>
              <div className="flex flex-wrap gap-4">
                {insights.hotNeighborhoods.map((hood, i) => (
                  <div key={i} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all cursor-pointer">
                    {hood}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-white/50">Failed to load insights.</div>
        )}
      </div>
    </Layout>
  );
}
