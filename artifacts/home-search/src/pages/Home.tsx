import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, MapPin, ArrowRight, TrendingUp } from "lucide-react";
import { useSearchProperties, useGetFeaturedProperties, useGetTrendingSearches } from "@workspace/api-client-react";
import { PropertyCard } from "@/components/PropertyCard";
import { Layout } from "@/components/Layout";

const PLACEHOLDERS = [
  "Modern condo in downtown Toronto under $900K",
  "4-bed house with a backyard in Vancouver",
  "Walkable neighbourhood near transit, great schools in Ottawa",
  "Lakeside cottage near Muskoka"
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  
  const { data: featuredProperties, isLoading: isFeaturedLoading } = useGetFeaturedProperties();
  const { data: trendingSearches } = useGetTrendingSearches();

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLocation(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <Layout>
      <section className="relative min-h-[70vh] flex items-center justify-center pt-20 pb-32 px-4 overflow-hidden">
        {/* Dynamic hero background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background z-10" />
          <motion.div 
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-primary/10 blur-[150px]"
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="container max-w-4xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-wide mb-8">
              <Sparkles size={14} />
              <span>AI-POWERED DISCOVERY</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
              Describe your <span className="text-primary italic font-serif pr-2">perfect</span> home.
            </h1>
            <p className="text-lg md:text-xl text-white/60 mb-12 max-w-2xl mx-auto font-light">
              Nestly understands exactly what you're looking for. Speak naturally, and we'll find the match.
            </p>

            <form onSubmit={handleSearch} className="relative max-w-3xl mx-auto group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
              
              <div className="relative flex items-center glass-panel rounded-2xl p-2 transition-all duration-300 focus-within:border-primary/50 focus-within:bg-card/80">
                <div className="pl-4 text-primary">
                  <Search size={24} />
                </div>
                
                <div className="relative flex-1 h-16 ml-3">
                  <AnimatePresence mode="wait">
                    {!query && (
                      <motion.div
                        key={placeholderIdx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 flex items-center text-white/30 text-lg md:text-xl pointer-events-none"
                      >
                        {PLACEHOLDERS[placeholderIdx]}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="absolute inset-0 w-full h-full bg-transparent border-none outline-none text-lg md:text-xl text-white placeholder-transparent"
                    placeholder=" "
                  />
                </div>
                
                <button 
                  type="submit"
                  className="h-14 px-8 rounded-xl bg-primary text-primary-foreground font-semibold text-lg flex items-center gap-2 hover:bg-primary/90 transition-colors"
                >
                  Search
                  <ArrowRight size={20} />
                </button>
              </div>
            </form>

            {trendingSearches && trendingSearches.length > 0 && (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <span className="text-sm text-white/40">Trending:</span>
                {trendingSearches.slice(0, 3).map((trend, i) => (
                  <button 
                    key={i}
                    onClick={() => setLocation(`/search?q=${encodeURIComponent(trend.query)}`)}
                    className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-white/70 hover:text-white hover:border-primary/50 hover:bg-primary/10 transition-colors flex items-center gap-1"
                  >
                    <TrendingUp size={14} className="text-primary" />
                    {trend.query}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-8 py-20 border-t border-white/5">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold font-serif mb-2">Featured Residences</h2>
            <p className="text-white/50">Curated properties representing the pinnacle of design.</p>
          </div>
          <Link href="/search" className="hidden md:flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
            View all collections <ArrowRight size={16} />
          </Link>
        </div>

        {isFeaturedLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-card border border-white/5 h-[450px] animate-pulse" />
            ))}
          </div>
        ) : featuredProperties && featuredProperties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredProperties.slice(0, 3).map((property, idx) => (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
              >
                <PropertyCard property={property} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-white/40">No featured properties available at the moment.</div>
        )}
      </section>
    </Layout>
  );
}
