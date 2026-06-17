import { useEffect, useRef, useState } from "react";
import {
  useGetProperty,
  getGetPropertyQueryKey,
  useRecordVisitedProperty,
} from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@clerk/react";
import { Layout } from "@/components/Layout";
import {
  MapPin,
  BedDouble,
  Bath,
  Square,
  Calendar,
  Heart,
  Share,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useFavorite } from "@/hooks/useFavorite";
import { useToast } from "@/hooks/use-toast";

function StatRow({ label, value }: { label: string; value: string }) {
  const unavailable = value === "Not available";
  return (
    <div className="flex justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
      <span className="text-white/60">{label}</span>
      <span className={unavailable ? "text-white/35 italic" : "font-medium"}>{value}</span>
    </div>
  );
}

export default function PropertyDetails() {
  const [, params] = useRoute("/property/:id");
  const id = params?.id || "";
  const { isSignedIn, isLoaded } = useAuth();
  const { toast } = useToast();

  const { data: property, isLoading } = useGetProperty(id, {
    query: { enabled: !!id, queryKey: getGetPropertyQueryKey(id) },
  });

  const { isFavorite, toggle, isBusy } = useFavorite(
    property ?? ({ id } as never),
  );

  // ---- Carousel / lightbox state ----
  const photos = property?.photos ?? [];
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    setActive(0);
  }, [id]);

  function step(dir: number) {
    if (photos.length === 0) return;
    setActive((i) => (i + dir + photos.length) % photos.length);
  }

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, photos.length]);

  // ---- Record visit once per property after authed load ----
  const recordVisit = useRecordVisitedProperty();
  const recordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!property || !isLoaded || !isSignedIn) return;
    if (recordedRef.current === property.id) return;
    recordedRef.current = property.id;
    recordVisit.mutate({ data: { propertyData: property } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id, isLoaded, isSignedIn]);

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: property?.address ?? "Nestly listing", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Property link copied to your clipboard." });
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

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
          <Link href="/" className="text-primary hover:underline">
            Return to Home
          </Link>
        </div>
      </Layout>
    );
  }

  const hero = photos[active];
  const pricePerSqft =
    property.pricePerSqft != null ? `$${property.pricePerSqft.toLocaleString()}` : "Not available";
  const daysOnMarket =
    property.daysOnMarket != null
      ? `${property.daysOnMarket} ${property.daysOnMarket === 1 ? "day" : "days"}`
      : "Not available";
  const mlsId = property.mlsId || "Not available";
  const yearBuilt = property.yearBuilt != null ? String(property.yearBuilt) : "Not available";

  return (
    <Layout>
      <div className="relative">
        <Link
          href="/"
          className="absolute top-8 left-8 z-30 p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft size={20} /> Back
        </Link>

        {/* Hero carousel */}
        <div className="h-[60vh] w-full relative group/hero bg-card">
          {hero ? (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="block h-full w-full cursor-zoom-in"
              aria-label="Open full gallery"
            >
              <img src={hero} alt={property.address} className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30">
              No photo available
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />

          {photos.length > 1 && (
            <>
              <button
                onClick={() => step(-1)}
                aria-label="Previous photo"
                className="absolute left-6 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white opacity-0 group-hover/hero:opacity-100 hover:bg-black/60 transition-all"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={() => step(1)}
                aria-label="Next photo"
                className="absolute right-6 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white opacity-0 group-hover/hero:opacity-100 hover:bg-black/60 transition-all"
              >
                <ChevronRight size={22} />
              </button>
              <div className="absolute bottom-6 right-6 z-20 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs font-medium text-white/90">
                {active + 1} / {photos.length}
              </div>
            </>
          )}
        </div>

        <div className="container mx-auto px-4 md:px-8 relative -mt-32 z-20 pb-20">
          <div className="glass-panel p-8 md:p-12 rounded-3xl mb-8 flex flex-col md:flex-row justify-between gap-8 items-start">
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold tracking-wider uppercase mb-6">
                {property.propertyType}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4 leading-tight">
                {property.address}
              </h1>
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
                {property.listingUrl ? (
                  <a
                    href={property.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    View on {property.source} <ExternalLink size={18} />
                  </a>
                ) : (
                  <div className="flex-1 py-4 rounded-xl border border-white/10 text-white/40 font-medium text-center">
                    Source link unavailable
                  </div>
                )}
                <button
                  onClick={() => void toggle()}
                  disabled={isBusy}
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
                  className="p-4 rounded-xl border border-white/20 hover:bg-white/5 transition-colors text-white disabled:opacity-50"
                >
                  <Heart size={24} className={isFavorite ? "fill-primary text-primary" : ""} />
                </button>
                <button
                  onClick={() => void handleShare()}
                  aria-label="Share this listing"
                  className="p-4 rounded-xl border border-white/20 hover:bg-white/5 transition-colors text-white"
                >
                  <Share size={24} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <section className="glass-panel p-8 rounded-3xl">
                <h3 className="text-2xl font-serif font-bold mb-6">About this home</h3>
                {property.description ? (
                  <p className="text-white/70 leading-relaxed whitespace-pre-line text-lg font-light">
                    {property.description}
                  </p>
                ) : (
                  <p className="text-white/35 italic text-lg">
                    No description available for this listing.
                  </p>
                )}
              </section>

              {photos.length > 1 && (
                <section className="glass-panel p-8 rounded-3xl">
                  <h3 className="text-2xl font-serif font-bold mb-6">
                    Gallery <span className="text-white/30 text-base font-sans">({photos.length} photos)</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {photos.map((photo, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setActive(i);
                          setLightbox(true);
                        }}
                        className={`relative overflow-hidden rounded-xl group/thumb ${
                          i === active ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        <img
                          src={photo}
                          alt={`${property.address} photo ${i + 1}`}
                          className="w-full h-40 object-cover transition-transform duration-500 group-hover/thumb:scale-105"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-8">
              <section className="glass-panel p-8 rounded-3xl">
                <h3 className="text-xl font-serif font-bold mb-6">Listing details</h3>
                <div className="space-y-4">
                  <StatRow label="Price / sqft (calculated)" value={pricePerSqft} />
                  <StatRow label="Days on market" value={daysOnMarket} />
                  <StatRow label="Year built" value={yearBuilt} />
                  <StatRow label="MLS ID" value={mlsId} />
                  <StatRow label="Source" value={property.source} />
                </div>
                {property.listingUrl && (
                  <a
                    href={property.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-2 text-sm text-accent2 hover:text-accent2/80 transition-colors"
                  >
                    View original listing <ExternalLink size={14} />
                  </a>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && hero && (
        <div
          className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            aria-label="Close gallery"
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} />
          </button>
          <img
            src={hero}
            alt={property.address}
            className="max-h-[88vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous photo"
                className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft size={26} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next photo"
                className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight size={26} />
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white/10 text-sm text-white/90">
                {active + 1} / {photos.length}
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
