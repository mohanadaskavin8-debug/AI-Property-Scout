import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Search, Heart, TrendingUp, Clock, LogOut } from "lucide-react";
import { Show, useUser, useClerk } from "@clerk/react";
import { NotificationBell } from "@/components/NotificationBell";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AuthArea() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const initial = (
    user?.firstName?.[0] ||
    user?.username?.[0] ||
    user?.primaryEmailAddress?.emailAddress?.[0] ||
    "N"
  ).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="px-4 py-2 rounded-full text-sm font-medium bg-primary text-black hover:bg-primary/90 transition-colors"
        >
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover border border-white/15"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold border border-primary/30">
            {initial}
          </div>
        )}
        <button
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="text-white/50 hover:text-white transition-colors"
          title="Log out"
        >
          <LogOut size={18} />
        </button>
      </Show>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/favorites", label: "Favorites", icon: Heart },
    { href: "/visited", label: "Visited", icon: Clock },
    { href: "/market", label: "Market", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen flex flex-col w-full bg-background text-foreground relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/60 backdrop-blur-xl transition-all duration-300">
        <div className="container mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold font-serif text-primary tracking-wider">
              NESTLY
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm tracking-wide transition-colors ${
                    isActive
                      ? "text-primary font-medium"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="md:hidden flex gap-2">
              {navLinks.map((link) => {
                const isActive = location === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`p-2 rounded-full transition-colors ${
                      isActive
                        ? "text-primary bg-primary/10"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={20} />
                  </Link>
                );
              })}
            </div>
            <NotificationBell />
            <AuthArea />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">{children}</main>

      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="container mx-auto px-4 md:px-8 text-center text-white/40 text-sm">
          <p>© {new Date().getFullYear()} Nestly. Redefining Real Estate.</p>
        </div>
      </footer>
    </div>
  );
}
