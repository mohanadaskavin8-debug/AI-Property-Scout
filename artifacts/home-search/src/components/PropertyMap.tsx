import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import type { PointFeature } from "supercluster";
import "leaflet/dist/leaflet.css";
import { Property } from "@workspace/api-client-react";
import { priceLabel } from "@/lib/format";

export interface PinnedProperty extends Property {
  lat: number;
  lng: number;
}

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Toronto — used only to center an empty viewport, never rendered as a pin.
const DEFAULT_CENTER: [number, number] = [43.6532, -79.3832];

type LeafProps = { cluster: false; propertyId: string; price: number };

function FitBounds({ pinned }: { pinned: PinnedProperty[] }) {
  const map = useMap();
  const signature = pinned
    .map((p) => p.id)
    .sort()
    .join(",");
  const prev = useRef("");
  useEffect(() => {
    if (!pinned.length) return;
    if (signature === prev.current) return;
    prev.current = signature;
    if (pinned.length === 1) {
      map.flyTo([pinned[0].lat, pinned[0].lng], 14, { duration: 0.8 });
      return;
    }
    const bounds = L.latLngBounds(pinned.map((p) => [p.lat, p.lng] as [number, number]));
    map.flyToBounds(bounds, { padding: [90, 90], maxZoom: 15, duration: 0.8 });
  }, [signature, pinned, map]);
  return null;
}

function FlyToSelected({
  pinned,
  selectedId,
}: {
  pinned: PinnedProperty[];
  selectedId: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const target = pinned.find((p) => p.id === selectedId);
    if (!target) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [selectedId, pinned, map]);
  return null;
}

function ClusterLayer({
  pinned,
  selectedId,
  hoveredId,
  onSelect,
}: {
  pinned: PinnedProperty[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const [clusters, setClusters] = useState<Array<PointFeature<Record<string, unknown>>>>([]);
  const indexRef = useRef<Supercluster<LeafProps> | null>(null);

  const points = useMemo<Array<PointFeature<LeafProps>>>(
    () =>
      pinned.map((p) => ({
        type: "Feature",
        properties: { cluster: false, propertyId: p.id, price: p.price },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    [pinned],
  );

  const refresh = () => {
    const index = indexRef.current;
    if (!index) return;
    const b = map.getBounds();
    const bbox: [number, number, number, number] = [
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth(),
    ];
    setClusters(index.getClusters(bbox, Math.round(map.getZoom())));
  };

  useEffect(() => {
    const index = new Supercluster<LeafProps>({ radius: 64, maxZoom: 16 });
    index.load(points);
    indexRef.current = index;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  useMapEvents({ moveend: refresh, zoomend: refresh });

  return (
    <>
      {clusters.map((c) => {
        const [lng, lat] = c.geometry.coordinates as [number, number];
        const props = c.properties as Record<string, unknown>;

        if (props.cluster) {
          const count = props.point_count as number;
          const clusterId = props.cluster_id as number;
          const size = count < 10 ? 42 : count < 50 ? 52 : 62;
          const icon = L.divIcon({
            html: `<div class="nestly-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`,
            className: "nestly-marker",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          return (
            <Marker
              key={`cluster-${clusterId}`}
              position={[lat, lng]}
              icon={icon}
              title={`${count} listings in this area — click to zoom in`}
              eventHandlers={{
                click: () => {
                  const index = indexRef.current;
                  if (!index) return;
                  const zoom = Math.min(index.getClusterExpansionZoom(clusterId), 16);
                  map.flyTo([lat, lng], zoom, { duration: 0.6 });
                },
              }}
            />
          );
        }

        const id = props.propertyId as string;
        const price = props.price as number;
        const selected = id === selectedId;
        const hovered = id === hoveredId;
        const cls = `nestly-pin${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}`;
        const icon = L.divIcon({
          html: `<div class="${cls}">${priceLabel(price)}</div>`,
          className: "nestly-marker",
          iconSize: [70, 30],
          iconAnchor: [35, 30],
        });
        return (
          <Marker
            key={id}
            position={[lat, lng]}
            icon={icon}
            title={`Listing — ${priceLabel(price)}`}
            zIndexOffset={selected ? 1000 : hovered ? 500 : 0}
            eventHandlers={{ click: () => onSelect(id) }}
          />
        );
      })}
    </>
  );
}

export function PropertyMap({
  pinned,
  selectedId,
  hoveredId,
  onSelect,
}: {
  pinned: PinnedProperty[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
}) {
  const initialCenter = pinned.length
    ? ([pinned[0].lat, pinned[0].lng] as [number, number])
    : DEFAULT_CENTER;

  return (
    <MapContainer
      center={initialCenter}
      zoom={11}
      zoomControl={false}
      attributionControl
      preferCanvas
      className="h-full w-full"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} subdomains="abcd" maxZoom={20} />
      <ClusterLayer
        pinned={pinned}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelect}
      />
      <FitBounds pinned={pinned} />
      <FlyToSelected pinned={pinned} selectedId={selectedId} />
    </MapContainer>
  );
}
