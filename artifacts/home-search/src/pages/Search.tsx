import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useSearchProperties, Property } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyMap, PinnedProperty } from "@/components/PropertyMap";
import { MapLiveCounters } from "@/components/MapLiveCounters";
import { BottomAISearchBar } from "@/components/BottomAISearchBar";
import { SavedSearches } from "@/components/SavedSearches";
import { PropertyDrawer } from "@/components/PropertyDrawer";
import { useGeocodePolling } from "@/hooks/useGeocodePolling";
import { Sparkles, Map as MapIcon, LayoutGrid, Loader2, MapPin } from "lucide-react";

type ViewMode = "map" | "list";

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const base =
    "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors";
  return (
    <div className="glass-panel inline-flex items-center gap-1 rounded-full p-1" role="group" aria-label="Toggle map or list view">
      <button
        onClick={() => onChange("map")}
        aria-pressed={view === "map"}
        className={`${base} ${view === "map" ? "bg-primary text-black" : "text-white/60 hover:text-white"}`}
      >
        <MapIcon size={15} /> Map
      </button>
      <button
        onClick={() => onChange("list")}
        aria-pressed={view === "list"}
        className={`${base} ${view === "list" ? "bg-primary text-black" : "text-white/60 hover:text-white"}`}
      >
        <LayoutGrid size={15} /> List
      </button>
    </div>
  );
}

function FilterChips({ filters }: { filters: Record<string, unknown> | undefined | null }) {
  if (!filters) return null;
  const entries = Object.entries(filters).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  );
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, val]) => (
        <span
          key={key}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70"
        >
          <span className="text-white/40">{key.replace(/([A-Z])/g, " $1").trim()}: </span>
          {Array.isArray(val) ? val.join(", ") : String(val)}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Property["geocodeStatus"] }) {
  if (status === "ok" || status == null) return null;
  const label = status === "pending" ? "Location pending" : "Map pin unavailable";
  const tone =
    status === "pending"
      ? "border-accent2/40 text-accent2 bg-accent2/10"
      : "border-white/15 text-white/50 bg-white/5";
  return (
    <span
      className={`absolute left-3 top-3 z-30 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur-md ${tone}`}
    >
      <MapPin size={10} /> {label}
    </span>
  );
}

export default function Search() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState(() => readParam("q"));
  const [view, setViewState] = useState<ViewMode>(() =>
    readParam("view") === "list" ? "list" : "map",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { mutate: search, data: searchResult, isPending } = useSearchProperties();

  useEffect(() => {
    if (q) {
      setSelectedId(null);
      search({ data: { prompt: q } });
    }
  }, [q, search]);

  const rawProperties = useMemo(() => searchResult?.properties ?? [], [searchResult]);
  const properties = useGeocodePolling(rawProperties);

  const pinned = useMemo<PinnedProperty[]>(
    () =>
      properties.filter(
        (p) => p.geocodeStatus === "ok" && p.lat != null && p.lng != null,
      ) as PinnedProperty[],
    [properties],
  );

  const total = properties.length;
  const onMap = pinned.length;
  const locating = properties.filter((p) => (p.geocodeStatus ?? "ok") === "pending").length;
  const failed = properties.filter((p) => p.geocodeStatus === "failed").length;
  const unmapped = locating + failed;

  const selected = useMemo(
    () => properties.find((p) => p.id === selectedId) ?? null,
    [properties, selectedId],
  );

  function setView(v: ViewMode) {
    setViewState(v);
    const params = new URLSearchParams(window.location.search);
    params.set("view", v);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  function runSearch(query: string) {
    setQ(query);
    const params = new URLSearchParams(window.location.search);
    params.set("q", query);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  const hasResults = total > 0;
  const showEmpty = !isPending && !!searchResult && !hasResults;

  // ---------------- MAP VIEW ----------------
  if (view === "map") {
    return (
      <Layout>
        <section className="relative w-full" style={{ height: "calc(100vh - 5rem)" }}>
          <PropertyMap
            pinned={pinned}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
          />

          {/* top overlay */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500]">
            <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/75 to-transparent" />
            <div className="relative flex items-start justify-between gap-4 p-4 md:p-6">
              <div className="pointer-events-auto max-w-md">
                {q && (
                  <div className="glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-accent2">
                      <Sparkles size={13} /> AI Search
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm italic text-white/85">"{q}"</p>
                    {searchResult?.searchSummary && (
                      <p className="mt-3 text-xs leading-relaxed text-white/55">
                        {searchResult.searchSummary}
                      </p>
                    )}
                    <div className="mt-3">
                      <FilterChips filters={searchResult?.parsedFilters as Record<string, unknown> | undefined} />
                    </div>
                  </div>
                )}
                <div className="mt-3">
                  <SavedSearches
                    currentQuery={q}
                    parsedFilters={searchResult?.parsedFilters}
                    onRun={runSearch}
                  />
                </div>
              </div>

              <div className="pointer-events-auto flex flex-col items-end gap-3">
                <ViewToggle view={view} onChange={setView} />
                {hasResults && <MapLiveCounters total={total} onMap={onMap} locating={locating} />}
                {hasResults && unmapped > 0 && (
                  <button
                    onClick={() => setView("list")}
                    className="glass-panel rounded-full px-3 py-1.5 text-right text-[11px] text-white/55 transition-colors hover:text-white"
                  >
                    {unmapped} {unmapped === 1 ? "listing" : "listings"} not yet on the map — view
                    list
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* selected property drawer */}
          <div className="pointer-events-none absolute bottom-24 left-4 z-[600] md:left-6">
            <PropertyDrawer property={selected} onClose={() => setSelectedId(null)} />
          </div>

          {/* bottom AI search bar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[550] flex justify-center px-4">
            <BottomAISearchBar initialQuery={q} onSearch={runSearch} pending={isPending} />
          </div>

          {/* loading / empty states */}
          {isPending && (
            <div className="pointer-events-none absolute inset-0 z-[540] flex items-center justify-center">
              <div className="glass-panel flex items-center gap-3 rounded-2xl px-6 py-4">
                <Loader2 className="animate-spin text-accent2" size={20} />
                <div>
                  <p className="text-sm font-medium text-white">Scanning live Realtor.ca listings…</p>
                  <p className="text-xs text-white/50">Real data can take 20–60s on a cold search.</p>
                </div>
              </div>
            </div>
          )}
          {showEmpty && (
            <div className="pointer-events-none absolute inset-0 z-[540] flex items-center justify-center px-4">
              <div className="glass-panel max-w-sm rounded-2xl p-8 text-center">
                <p className="text-lg text-white/80">No live listings matched.</p>
                <p className="mt-2 text-sm text-white/45">
                  We only show real listings — try widening your search or another city.
                </p>
              </div>
            </div>
          )}
        </section>
      </Layout>
    );
  }

  // ---------------- LIST VIEW ----------------
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="flex items-center gap-3 font-serif text-3xl font-bold">
            <Sparkles className="text-primary" />
            AI Search Results
          </h1>
          <div className="flex items-center gap-3">
            {hasResults && <MapLiveCounters total={total} onMap={onMap} locating={locating} />}
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>

        <div className="mb-8 flex justify-center md:justify-start">
          <BottomAISearchBar initialQuery={q} onSearch={runSearch} pending={isPending} />
        </div>

        <div className="mb-8">
          <SavedSearches
            currentQuery={q}
            parsedFilters={searchResult?.parsedFilters}
            onRun={runSearch}
          />
        </div>

        {q && (
          <div className="glass-panel mb-8 inline-block max-w-3xl rounded-2xl p-6">
            <p className="text-lg italic text-white/80">"{q}"</p>
            {searchResult?.searchSummary && (
              <p className="mt-3 text-sm uppercase tracking-wide text-primary">
                {searchResult.searchSummary}
              </p>
            )}
            <div className="mt-4">
              <FilterChips filters={searchResult?.parsedFilters as Record<string, unknown> | undefined} />
            </div>
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-medium">
            {isPending ? "Searching…" : `${total} ${total === 1 ? "Property" : "Properties"} Found`}
          </h2>
        </div>

        {isPending ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="relative h-[400px] animate-pulse overflow-hidden rounded-2xl border border-white/5 bg-card"
              >
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>
            ))}
          </div>
        ) : hasResults ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {properties.map((property, idx) => (
              <motion.div
                key={property.id}
                className="relative"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: Math.min(idx * 0.05, 0.4) }}
              >
                <StatusBadge status={property.geocodeStatus} />
                <PropertyCard property={property} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl py-32 text-center">
            <p className="mb-2 text-xl text-white/50">No live listings matched.</p>
            <p className="text-sm text-white/30">
              We only show real listings — try widening your search or another city.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
