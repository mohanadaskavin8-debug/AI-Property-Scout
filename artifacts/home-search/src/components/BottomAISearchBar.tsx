import { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";

export function BottomAISearchBar({
  initialQuery,
  onSearch,
  pending,
}: {
  initialQuery: string;
  onSearch: (query: string) => void;
  pending?: boolean;
}) {
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSearch(trimmed);
      }}
      className="glass-panel pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-full border-white/10 py-2 pl-5 pr-2 shadow-2xl"
    >
      <Sparkles size={18} className="shrink-0 text-accent2" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Describe your ideal home"
        placeholder="Describe your ideal home — e.g. '3-bed near High Park, Toronto under $1.4M'"
        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-black transition-colors hover:bg-primary/90 disabled:opacity-50"
        aria-label="Search"
      >
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
