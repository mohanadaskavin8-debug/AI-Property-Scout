import { useGetProperty } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { MapPin, BedDouble, Bath, Square, Calendar, Heart, Share, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function PropertyDetails() {
  const [, params] = useRoute("/property/:id");
  const id = params?.id || "";

  const { data: property, isLoading } = useGetProperty(id, {
    query: { enabled: !!id }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className="text-2xl font-bold mb-4">Property Not Found</h2>
          <Link href="/" className="text-primary hover:underline">Return to Home</Link>
        </div>
      </Layout>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <Layout>
      <div className="relative">
        <Link href="/" className="absolute top-8 left-8 z-30 p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-colors inline-flex items-center gap-2">
          <ChevronLeft size={20} /> Back
        </Link>
        
        {/* Full screen hero image */}
        <div className="h-[60vh] w-full relative">
          {property.photos && property.photos.length > 0 ? (
            <img 
              src={property.photos[0]} 
              alt={property.address} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-card flex items-center justify-center">No Photo Available</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>

        <div className="container mx-auto px-4 md:px-8 relative -mt-32 z-20 pb-20">
          <div className="glass-panel p-8 md:p-12 rounded-3xl mb-8 flex flex-col md:flex-row justify-between gap-8 items-start">
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold tracking-wider uppercase mb-6">
                {property.propertyType}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4 leading-tight">{property.address}</h1>
              <div className="flex items-center text-lg text-white/60 mb-6">
                <MapPin size={20} className="mr-2" />
                {property.city}, {property.state} {property.zipCode}
              </div>
              
              <div className="flex flex-wrap items-center gap-6 md:gap-12">
                {property.bedrooms != null && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-sm uppercase tracking-wider mb-1">Bedrooms</span>
                    <div className="flex items-center gap-2 text-xl font-medium">
                      <BedDouble className="text-primary" /> {property.bedrooms}
                    </div>
                  </div>
                )}
                {property.bathrooms != null && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-sm uppercase tracking-wider mb-1">Bathrooms</span>
                    <div className="flex items-center gap-2 text-xl font-medium">
                      <Bath className="text-primary" /> {property.bathrooms}
                    </div>
                  </div>
                )}
                {property.sqft != null && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-sm uppercase tracking-wider mb-1">Square Feet</span>
                    <div className="flex items-center gap-2 text-xl font-medium">
                      <Square className="text-primary" /> {property.sqft.toLocaleString()}
                    </div>
                  </div>
                )}
                {property.yearBuilt != null && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-sm uppercase tracking-wider mb-1">Year Built</span>
                    <div className="flex items-center gap-2 text-xl font-medium">
                      <Calendar className="text-primary" /> {property.yearBuilt}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end w-full md:w-auto min-w-[300px]">
              <div className="text-5xl font-bold font-serif text-primary glow-text mb-6">
                {formatPrice(property.price)}
              </div>
              
              <div className="flex gap-4 w-full">
                <button className="flex-1 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-colors">
                  Contact Agent
                </button>
                <button className="p-4 rounded-xl border border-white/20 hover:bg-white/5 transition-colors text-white">
                  <Heart size={24} />
                </button>
                <button className="p-4 rounded-xl border border-white/20 hover:bg-white/5 transition-colors text-white">
                  <Share size={24} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <section className="glass-panel p-8 rounded-3xl">
                <h3 className="text-2xl font-serif font-bold mb-6">About this home</h3>
                <p className="text-white/70 leading-relaxed whitespace-pre-line text-lg font-light">
                  {property.description || "No description available for this property."}
                </p>
              </section>

              {property.photos && property.photos.length > 1 && (
                <section className="glass-panel p-8 rounded-3xl">
                  <h3 className="text-2xl font-serif font-bold mb-6">Gallery</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {property.photos.slice(1).map((photo, i) => (
                      <img key={i} src={photo} alt={`Gallery ${i+1}`} className="w-full h-48 object-cover rounded-xl" />
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-8">
              <section className="glass-panel p-8 rounded-3xl">
                <h3 className="text-xl font-serif font-bold mb-6">Financial Overview</h3>
                <div className="space-y-4">
                  <div className="flex justify-between border-b border-white/5 pb-4">
                    <span className="text-white/60">Price per sqft</span>
                    <span className="font-medium">${property.pricePerSqft || Math.round(property.price / (property.sqft || 1))}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-4">
                    <span className="text-white/60">Days on market</span>
                    <span className="font-medium">{property.daysOnMarket || 12}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">MLS ID</span>
                    <span className="font-medium">{property.mlsId || "N/A"}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
