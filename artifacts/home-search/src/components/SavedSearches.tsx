import { useAuth } from "@clerk/react";
import { BookmarkPlus, Bookmark, X, Search as SearchIcon } from "lucide-react";
import {
  useListSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
  getListSavedSearchesQueryKey,
  type ParsedFilters,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function SavedSearches({
  currentQuery,
  parsedFilters,
  onRun,
}: {
  currentQuery: string;
  parsedFilters?: ParsedFilters;
  onRun: (query: string) => void;
}) {
  const { isSignedIn } = useAuth();
  const { toast } = useToast();

  const { data: saved, refetch } = useListSavedSearches({
    query: { enabled: !!isSignedIn, queryKey: getListSavedSearchesQueryKey() },
  });
  const create = useCreateSavedSearch();
  const remove = useDeleteSavedSearch();

  if (!isSignedIn) return null;

  const list = saved ?? [];
  const trimmed = currentQuery.trim();
  const alreadySaved =
    !!trimmed && list.some((s) => normalize(s.query) === normalize(trimmed));

  async function handleSave() {
    if (!trimmed || alreadySaved) return;
    await create.mutateAsync({
      data: { query: trimmed, parsedFilters, alertEnabled: false },
    });
    await refetch();
    toast({
      title: "Search saved",
      description: "Find it anytime under your saved searches.",
    });
  }

  async function handleDelete(id: number) {
    await remove.mutateAsync({ id });
    await refetch();
  }

  return (
    <div className="flex flex-col gap-3">
      {trimmed && (
        <button
          onClick={() => void handleSave()}
          disabled={alreadySaved || create.isPending}
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            alreadySaved
              ? "border-primary/30 bg-primary/10 text-primary cursor-default"
              : "border-white/15 bg-white/5 text-white hover:bg-white/10"
          }`}
        >
          {alreadySaved ? <Bookmark size={15} /> : <BookmarkPlus size={15} />}
          {alreadySaved ? "Search saved" : "Save this search"}
        </button>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-white/40">Saved:</span>
          {list.map((s) => (
            <span
              key={s.id}
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1.5 text-xs text-white/80"
            >
              <button
                onClick={() => onRun(s.query)}
                className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                title="Run this search"
              >
                <SearchIcon size={11} className="opacity-50" />
                <span className="max-w-[200px] truncate">{s.query}</span>
              </button>
              <button
                onClick={() => void handleDelete(s.id)}
                aria-label="Delete saved search"
                className="rounded-full p-0.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
