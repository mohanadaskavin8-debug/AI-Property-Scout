import { Layout } from "@/components/Layout";
import { useListVisitedProperties } from "@workspace/api-client-react";
import { PropertyCard } from "@/components/PropertyCard";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { Show } from "@clerk/react";
import { Link } from "wouter";

function VisitedContent() {
  const { data: visited, isLoading } = useListVisitedProperties();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-card border border-white/5 h-[450px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!visited || visited.length === 0) {
    return (
      <div className="text-center py-32 glass-panel rounded-3xl">
        <Clock size={64} className="mx-auto text-white/10 mb-6" />
        <h2 className="text-2xl font-serif font-bold mb-2">No recently viewed homes</h2>
        <p className="text-white/40 mb-8">Properties you open will show up here for easy access.</p>
        <Link
          href="/search"
          className="inline-flex px-6 py-3 rounded-full text-sm font-medium bg-primary text-black hover:bg-primary/90 transition-colors"
        >
          Start searching
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {visited.map((v, idx) => (
        <motion.div
          key={v.id}
          className="relative"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: idx * 0.1 }}
        >
          {v.visitCount > 1 && (
            <span className="absolute left-3 top-3 z-30 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-md">
              <Clock size={10} /> Viewed {v.visitCount}×
            </span>
          )}
          <PropertyCard property={v.propertyData} />
        </motion.div>
      ))}
    </div>
  );
}

export default function Visited() {
  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-8 py-20">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4 flex items-center gap-4">
            <Clock className="text-primary" size={40} />
            Recently Viewed
          </h1>
          <p className="text-white/50 text-lg">Homes you've explored, kept close at hand.</p>
        </div>

        <Show when="signed-in">
          <VisitedContent />
        </Show>
        <Show when="signed-out">
          <div className="text-center py-32 glass-panel rounded-3xl">
            <Clock size={64} className="mx-auto text-white/10 mb-6" />
            <h2 className="text-2xl font-serif font-bold mb-2">Sign in to track your tour</h2>
            <p className="text-white/40 mb-8 max-w-md mx-auto">
              Create a free Nestly account to keep a history of the homes you view across devices.
            </p>
            <Link
              href="/sign-in"
              className="inline-flex px-6 py-3 rounded-full text-sm font-medium bg-primary text-black hover:bg-primary/90 transition-colors"
            >
              Sign in to continue
            </Link>
          </div>
        </Show>
      </div>
    </Layout>
  );
}
