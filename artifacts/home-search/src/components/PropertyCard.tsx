import { useState } from "react";
import { Link } from "wouter";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { Heart, MapPin, BedDouble, Bath, Square } from "lucide-react";
import { Property, useAddFavorite, useRemoveFavorite, useListFavorites } from "@workspace/api-client-react";

interface PropertyCardProps {
  property: Property;
  isFavorite?: boolean;
}

export function PropertyCard({ property, isFavorite: propIsFavorite }: PropertyCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const { data: favorites, refetch: refetchFavorites } = useListFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const isFavorite = propIsFavorite || favorites?.some(f => f.propertyData.id === property.id);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isFavorite) {
      const fav = favorites?.find(f => f.propertyData.id === property.id);
      if (fav) {
        await removeFavorite.mutateAsync({ id: fav.id });
        refetchFavorites();
      }
    } else {
      await addFavorite.mutateAsync({ data: { propertyData: property } });
      refetchFavorites();
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const imageSrc = property.photos?.[0] || "";

  return (
    <motion.div
      className="group relative rounded-2xl overflow-hidden glass-panel border-white/10 transition-all duration-500"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -8 }}
    >
      {/* Interactive glow effect */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition duration-300 group-hover:opacity-100 z-20"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              400px circle at ${mouseX}px ${mouseY}px,
              hsl(var(--primary) / 0.15),
              transparent 80%
            )
          `,
        }}
      />

      <Link href={`/property/${property.id}`} className="block relative z-10">
        <div className="relative h-64 overflow-hidden bg-card/50">
          {imageSrc ? (
            <motion.img
              src={imageSrc}
              alt={property.address}
              className="w-full h-full object-cover"
              animate={{
                scale: isHovered ? 1.05 : 1,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-card to-background flex items-center justify-center text-white/20">
              No Image Available
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          <div className="absolute top-4 right-4 z-20">
            <button 
              onClick={handleToggleFavorite}
              className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:text-primary hover:bg-black/60 transition-all"
            >
              <Heart size={18} className={isFavorite ? "fill-primary text-primary" : ""} />
            </button>
          </div>

          <div className="absolute bottom-4 left-4 right-4">
            <div className="text-2xl font-bold font-serif text-primary glow-text mb-1">
              {formatPrice(property.price)}
            </div>
            <div className="flex items-center text-sm text-white/80 font-medium">
              <MapPin size={14} className="mr-1 opacity-60" />
              {property.city}, {property.state}
            </div>
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-semibold text-lg text-white mb-4 line-clamp-1">
            {property.address}
          </h3>
          
          <div className="flex items-center justify-between text-white/60 text-sm">
            {property.bedrooms != null && (
              <div className="flex items-center gap-1.5">
                <BedDouble size={16} />
                <span>{property.bedrooms} Beds</span>
              </div>
            )}
            {property.bathrooms != null && (
              <div className="flex items-center gap-1.5">
                <Bath size={16} />
                <span>{property.bathrooms} Baths</span>
              </div>
            )}
            {property.sqft != null && (
              <div className="flex items-center gap-1.5">
                <Square size={16} />
                <span>{property.sqft.toLocaleString()} sqft</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
