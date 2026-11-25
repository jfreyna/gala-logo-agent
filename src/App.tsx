import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "./lib/router";
import { labelGoogleSignUpOnce } from "./lib/join";
import { Home } from "./pages/Home";
import { About } from "./pages/About";
import { Projects } from "./pages/Projects";
import { StudioRoute } from "./pages/Studio";
import { IdentityProof } from "./dev/IdentityProof";
import { Preview } from "./dev/Preview";

/**
 * Gala's places: the front page, About, a person's logos, and one logo's
 * studio. A signed-out visitor sees the front page and About; everything
 * else needs a Frilly sign-in.
 */
export function App() {
  const { location } = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    if (isAuthenticated) void labelGoogleSignUpOnce();
  }, [isAuthenticated]);

  // Development only: the sign-in proof page from gate 1.
  if (import.meta.env.DEV && location.pathname === "/proof") return <IdentityProof />;
  // Development only: the designed screens with the frames' sample content.
  if (import.meta.env.DEV && location.pathname.startsWith("/preview")) {
    return <Preview pathname={location.pathname} search={location.search} />;
  }

  if (isLoading) return <div className="min-h-full bg-background-2-light dark:bg-background-1-dark" />;

  if (location.pathname === "/about") return <About />;
  if (!isAuthenticated) return <Home />;
  if (location.pathname.startsWith("/studio/")) return <StudioRoute pathname={location.pathname} />;
  return <Projects />;
}
