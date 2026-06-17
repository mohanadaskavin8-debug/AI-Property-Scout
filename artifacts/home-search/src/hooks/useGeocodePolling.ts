import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Property, getGeocodeStatus } from "@workspace/api-client-react";

type Override = {
  lat: number | null;
  lng: number | null;
  geocodeStatus: "ok" | "pending" | "failed";
};

const MAX_POLLS = 50;
const POLL_INTERVAL_MS = 2500;

/**
 * Polls the geocode-status endpoint for any properties still "pending" and
 * merges resolved coordinates back into the list. Never fabricates a location:
 * a property only gains lat/lng when the server reports geocodeStatus "ok".
 */
export function useGeocodePolling(properties: Property[]): Property[] {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [pollCount, setPollCount] = useState(0);

  const signature = useMemo(
    () =>
      properties
        .map((p) => p.id)
        .sort()
        .join(","),
    [properties],
  );
  const prevSignature = useRef("");
  useEffect(() => {
    if (signature !== prevSignature.current) {
      prevSignature.current = signature;
      setOverrides({});
      setPollCount(0);
    }
  }, [signature]);

  const pendingIds = useMemo(
    () =>
      properties
        .filter(
          (p) => (overrides[p.id]?.geocodeStatus ?? p.geocodeStatus ?? "ok") === "pending",
        )
        .map((p) => p.id)
        .sort(),
    [properties, overrides],
  );

  const active = pendingIds.length > 0 && pollCount < MAX_POLLS;

  const { data } = useQuery({
    queryKey: ["geocode-status", pendingIds],
    queryFn: () => getGeocodeStatus({ ids: pendingIds }),
    enabled: active,
    refetchInterval: active ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    setPollCount((c) => c + 1);
    setOverrides((prev) => {
      const next = { ...prev };
      for (const entry of data) {
        if (entry.geocodeStatus !== "pending") {
          next[entry.id] = {
            lat: entry.lat ?? null,
            lng: entry.lng ?? null,
            geocodeStatus: entry.geocodeStatus,
          };
        }
      }
      return next;
    });
  }, [data]);

  return useMemo(
    () => properties.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p)),
    [properties, overrides],
  );
}
