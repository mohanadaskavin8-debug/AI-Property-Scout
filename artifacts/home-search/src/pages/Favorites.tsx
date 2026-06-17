import { Layout } from "@/components/Layout";
import { useListFavorites } from "@workspace/api-client-react";
import { PropertyCard } from "@/components/PropertyCard";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";

export default function Favorites() {
  const { data: favorites, isLoading } = useListFavorites();

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-8 py-20">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4 flex items-center gap-4">
            <Heart className="text-primary fill-primary/20" size={40} />
            Your Collection
          </h1>
          <p className="text-white/50 text-lg">Curated properties saved for your consideration.</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-card border border-white/5 h-[450px] animate-pulse" />
            ))}
          </div>
        ) : favorites && favorites.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {favorites.map((fav, idx) => (
              <motion.div
                key={fav.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <PropertyCard property={fav.propertyData} isFavorite={true} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-32 glass-panel rounded-3xl">
            <Heart size={64} className="mx-auto text-white/10 mb-6" />
            <h2 className="text-2xl font-serif font-bold mb-2">Start your collection</h2>
            <p className="text-white/40">Properties you save will appear here.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
