import { useState, useEffect } from "react";
import { IntroAnimation } from "@/components/IntroAnimation.tsx";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";

import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import React, { Suspense } from "react";
const Search = React.lazy(() => import("@/pages/Search"));
// Using basic placeholder components for others right now to ensure everything works
const PropertyDetails = React.lazy(() => import("@/pages/PropertyDetails"));
const Favorites = React.lazy(() => import("@/pages/Favorites"));
const Market = React.lazy(() => import("@/pages/Market"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin" />
        </div>
      </Layout>
    }>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/search" component={Search} />
        <Route path="/property/:id" component={PropertyDetails} />
        <Route path="/favorites" component={Favorites} />
        <Route path="/market" component={Market} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const skipIntro = new URLSearchParams(window.location.search).has("skip");
  const [introComplete, setIntroComplete] = useState(skipIntro);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {!introComplete && <IntroAnimation onComplete={() => setIntroComplete(true)} />}
        
        <div style={{ opacity: introComplete ? 1 : 0, transition: "opacity 1s ease-in-out" }}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
