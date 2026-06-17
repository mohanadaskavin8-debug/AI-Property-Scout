import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useSearchProperties } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { PropertyCard } from "@/components/PropertyCard";
import { Sparkles, Filter, X } from "lucide-react";

export default function Search() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const q = searchParams.get("q") || "";

  const { mutate: search, data: searchResult, isPending } = useSearchProperties();

  useEffect(() => {
    if (q) {
      search({ data: { prompt: q } });
    }
  }, [q, search]);

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-8 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold font-serif mb-4 flex items-center gap-3">
            <Sparkles className="text-primary" />
            AI Search Results
          </h1>
          <div className="glass-panel p-6 rounded-2xl inline-block max-w-3xl">
            <p className="text-lg text-white/80 italic">"{q}"</p>
            {searchResult?.searchSummary && (
              <p className="mt-4 text-primary text-sm tracking-wide uppercase">
                {searchResult.searchSummary}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar filters */}
          <aside className="w-full lg:w-64 shrink-0">
            <div className="glass-panel rounded-2xl p-6 sticky top-28">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Filter size={18} /> Filters
                </h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-3 block">Extracted Parameters</label>
                  {isPending ? (
                    <div className="space-y-2">
                      <div className="h-6 w-3/4 bg-white/5 rounded animate-pulse" />
                      <div className="h-6 w-1/2 bg-white/5 rounded animate-pulse" />
                    </div>
                  ) : searchResult?.parsedFilters ? (
                    <div className="space-y-3">
                      {Object.entries(searchResult.parsedFilters).map(([key, val]) => {
                        if (val === null || val === undefined || (Array.isArray(val) && val.length === 0)) return null;
                        return (
                          <div key={key} className="flex justify-between items-center text-sm">
                            <span className="text-white/60 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="font-medium text-white text-right max-w-[120px] truncate">{Array.isArray(val) ? val.join(", ") : String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>

          {/* Results Grid */}
          <div className="flex-1">
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-xl font-medium">
                {isPending ? "Searching..." : `${searchResult?.totalCount || 0} Properties Found`}
              </h2>
            </div>

            {isPending ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-2xl bg-card border border-white/5 h-[400px] animate-pulse relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                  </div>
                ))}
              </div>
            ) : searchResult?.properties && searchResult.properties.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {searchResult.properties.map((property, idx) => (
                  <motion.div
                    key={property.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                  >
                    <PropertyCard property={property} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-32 glass-panel rounded-2xl">
                <p className="text-xl text-white/50 mb-2">No properties matched exactly.</p>
                <p className="text-white/30 text-sm">Try adjusting your natural language query.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
