import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useListNotifications,
  useGetUnreadNotificationCount,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  type Notification,
} from "@workspace/api-client-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const { isSignedIn } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unread, refetch: refetchCount } = useGetUnreadNotificationCount({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetUnreadNotificationCountQueryKey(),
      refetchInterval: 60000,
    },
  });

  const { data: notifications, refetch } = useListNotifications({
    query: { enabled: !!isSignedIn && open, queryKey: getListNotificationsQueryKey() },
  });

  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!isSignedIn) return null;

  const count = unread?.count ?? 0;
  const items = notifications ?? [];

  async function handleMarkAll() {
    await markAll.mutateAsync();
    await Promise.all([refetch(), refetchCount()]);
  }

  async function handleOpen(n: Notification) {
    if (!n.readAt) {
      await markOne.mutateAsync({ id: n.id });
      await Promise.all([refetch(), refetchCount()]);
    }
    if (n.href) {
      setOpen(false);
      navigate(n.href);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative p-2 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-colors"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-black text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {items.some((n) => !n.readAt) && (
              <button
                onClick={() => void handleMarkAll()}
                disabled={markAll.isPending}
                className="inline-flex items-center gap-1 text-xs text-accent2 hover:text-accent2/80 transition-colors disabled:opacity-50"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bell size={36} className="mx-auto text-white/10 mb-4" />
                <p className="text-sm text-white/60">You're all caught up</p>
                <p className="mt-1 text-xs text-white/35">
                  We'll let you know about your saved searches and homes.
                </p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => void handleOpen(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 transition-colors hover:bg-white/5 ${
                    n.readAt ? "" : "bg-primary/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && (
                      <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className={n.readAt ? "pl-4" : ""}>
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-white/55">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-white/35">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
