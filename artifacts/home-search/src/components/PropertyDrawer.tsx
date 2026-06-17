import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import { Heart, MapPin, BedDouble, Bath, Square, X, ExternalLink } from "lucide-react";
import { Property } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/format";
import { useFavorite } from "@/hooks/useFavorite";

function DrawerCard({ property, onClose }: { property: Property; onClose: () => void }) {
  const { isFavorite, toggle } = useFavorite(property);
  const image = property.photos?.[0] || "";

  return (
    <motion.div
      initial={{ y: 48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 48, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="glass-panel pointer-events-auto w-[340px] overflow-hidden rounded-2xl border-white/10 shadow-2xl"
    >
      <div className="relative h-40">
        {image ? (
          <img src={image} alt={property.address} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-card text-sm text-white/20">
            No image available
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white/80 backdrop-blur-md transition-colors hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <button
          onClick={toggle}
          className="absolute left-2 top-2 rounded-full bg-black/50 p-1.5 text-white/80 backdrop-blur-md transition-colors hover:text-primary"
          aria-label="Save"
        >
          <Heart size={16} className={isFavorite ? "fill-primary text-primary" : ""} />
        </button>
        <div className="absolute bottom-3 left-3 text-xl font-bold font-serif text-primary glow-text">
          {formatPrice(property.price)}
        </div>
      </div>

      <div className="p-4">
        <h3 className="line-clamp-1 font-semibold text-white">{property.address}</h3>
        <div className="mt-1 flex items-center text-xs text-white/60">
          <MapPin size={12} className="mr-1" />
          {property.city}, {property.state}
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm text-white/70">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1">
              <BedDouble size={14} />
              {property.bedrooms}
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath size={14} />
              {property.bathrooms}
            </span>
          )}
          {property.sqft != null && (
            <span className="flex items-center gap-1">
              <Square size={14} />
              {property.sqft.toLocaleString()}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/property/${property.id}`}
            className="flex-1 rounded-full bg-primary py-2 text-center text-sm font-medium text-black transition-colors hover:bg-primary/90"
          >
            View details
          </Link>
          {property.listingUrl && (
            <a
              href={property.listingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
              aria-label="Open source listing"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/30">
          Source: {property.source}
        </div>
      </div>
    </motion.div>
  );
}

export function PropertyDrawer({
  property,
  onClose,
}: {
  property: Property | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence mode="wait">
      {property && <DrawerCard key={property.id} property={property} onClose={onClose} />}
    </AnimatePresence>
  );
}
