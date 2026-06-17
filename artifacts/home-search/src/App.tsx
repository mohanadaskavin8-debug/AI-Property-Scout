import React, { useState, useRef, useEffect, Suspense } from "react";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";

import { IntroAnimation } from "@/components/IntroAnimation.tsx";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

const Search = React.lazy(() => import("@/pages/Search"));
const PropertyDetails = React.lazy(() => import("@/pages/PropertyDetails"));
const Favorites = React.lazy(() => import("@/pages/Favorites"));
const Visited = React.lazy(() => import("@/pages/Visited"));
const Market = React.lazy(() => import("@/pages/Market"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Resolves the key from window.location.hostname so the same build serves
// multiple Clerk custom domains. Copy verbatim per clerk-auth skill.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Empty in dev (Clerk hits dev FAPI directly), auto-set in prod. Unconditional.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#D4AF6A",
    colorForeground: "#F5F3EE",
    colorMutedForeground: "#9A958B",
    colorDanger: "#E5484D",
    colorBackground: "#111114",
    colorInput: "#1A1A1F",
    colorInputForeground: "#F5F3EE",
    colorNeutral: "#2A2A30",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[#111114] border border-white/10 rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#F5F3EE] font-serif text-2xl",
    headerSubtitle: "text-[#9A958B]",
    socialButtonsBlockButton:
      "bg-white/5 border border-white/10 hover:bg-white/10",
    socialButtonsBlockButtonText: "text-[#F5F3EE]",
    dividerLine: "bg-white/10",
    dividerText: "text-[#9A958B]",
    formFieldLabel: "text-[#E8E4DC]",
    formFieldInput:
      "bg-[#1A1A1F] border border-white/10 text-[#F5F3EE]",
    formButtonPrimary:
      "bg-[#D4AF6A] hover:bg-[#c5a05c] text-[#0A0A0D] font-semibold",
    footerActionText: "text-[#9A958B]",
    footerActionLink: "text-[#D4AF6A] hover:text-[#E8C77E]",
    identityPreviewEditButton: "text-[#D4AF6A]",
    formFieldSuccessText: "text-emerald-400",
    formFieldErrorText: "text-[#E5484D]",
    alertText: "text-[#F5F3EE]",
    otpCodeFieldInput:
      "bg-[#1A1A1F] border border-white/10 text-[#F5F3EE]",
    logoBox: "flex justify-center mb-1",
    logoImage: "h-12 w-12",
    main: "gap-5",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

// Keeps the webview cache fresh when the signed-in user changes.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppShell() {
  const [introComplete, setIntroComplete] = useState(() => {
    const p = window.location.pathname;
    return (
      new URLSearchParams(window.location.search).has("skip") ||
      p.includes("/sign-in") ||
      p.includes("/sign-up")
    );
  });

  return (
    <TooltipProvider>
      {!introComplete && (
        <IntroAnimation onComplete={() => setIntroComplete(true)} />
      )}

      <div
        style={{
          opacity: introComplete ? 1 : 0,
          transition: "opacity 1s ease-in-out",
        }}
      >
        <Suspense
          fallback={
            <Layout>
              <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
              </div>
            </Layout>
          }
        >
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/search" component={Search} />
            <Route path="/property/:id" component={PropertyDetails} />
            <Route path="/favorites" component={Favorites} />
            <Route path="/visited" component={Visited} />
            <Route path="/market" component={Market} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to save homes, message your group, and use FindIT",
          },
        },
        signUp: {
          start: {
            title: "Create your Nestly account",
            subtitle: "Save homes, share with your group, and list your own",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <AppShell />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
