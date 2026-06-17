import { Layout } from "@/components/Layout";
import { useListFavorites } from "@workspace/api-client-react";
import { PropertyCard } from "@/components/PropertyCard";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { Show } from "@clerk/react";
import { Link } from "wouter";

function FavoritesContent() {
  const { data: favorites, isLoading } = useListFavorites();

  return (
    <>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-card border border-white/5 h-[450px] animate-pulse"
            />
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
          <h2 className="text-2xl font-serif font-bold mb-2">
            Start your collection
          </h2>
          <p className="text-white/40">Properties you save will appear here.</p>
        </div>
      )}
    </>
  );
}

export default function Favorites() {
  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-8 py-20">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4 flex items-center gap-4">
            <Heart className="text-primary fill-primary/20" size={40} />
            Your Collection
          </h1>
          <p className="text-white/50 text-lg">
            Curated properties saved for your consideration.
          </p>
        </div>

        <Show when="signed-in">
          <FavoritesContent />
        </Show>
        <Show when="signed-out">
          <div className="text-center py-32 glass-panel rounded-3xl">
            <Heart size={64} className="mx-auto text-white/10 mb-6" />
            <h2 className="text-2xl font-serif font-bold mb-2">
              Sign in to save homes
            </h2>
            <p className="text-white/40 mb-8 max-w-md mx-auto">
              Create a free Nestly account to build your collection of favorite
              residences and access it from anywhere.
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
