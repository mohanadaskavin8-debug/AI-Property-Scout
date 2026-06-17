import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

function Counter({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "gold" | "cyan" | "muted";
}) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toString());

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);

  const color =
    tone === "gold" ? "text-primary" : tone === "cyan" ? "text-accent2" : "text-white/80";

  return (
    <div className="flex flex-col items-start leading-none">
      <motion.span className={`text-2xl font-bold font-serif tabular-nums ${color}`}>
        {text}
      </motion.span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</span>
    </div>
  );
}

export function MapLiveCounters({
  total,
  onMap,
  locating,
}: {
  total: number;
  onMap: number;
  locating: number;
}) {
  return (
    <div className="glass-panel rounded-2xl px-5 py-3 flex items-center gap-5">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent2 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent2" />
      </span>
      <Counter value={total} label="Live listings" tone="gold" />
      <div className="h-8 w-px bg-white/10" />
      <Counter value={onMap} label="On map" tone="cyan" />
      {locating > 0 && (
        <>
          <div className="h-8 w-px bg-white/10" />
          <Counter value={locating} label="Locating" tone="muted" />
        </>
      )}
    </div>
  );
}
