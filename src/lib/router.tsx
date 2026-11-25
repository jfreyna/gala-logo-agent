import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

/**
 * A small router over the browser's history. Gala has four places: the
 * front page, About, the list of logos, and one logo's studio.
 */
type Location = { pathname: string; search: string };

const RouterContext = createContext<{ location: Location; navigate: (to: string) => void } | null>(null);

function currentLocation(): Location {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(currentLocation);

  useEffect(() => {
    const onPop = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    // Only paths on this origin. An absolute address is ignored, so nothing
    // read from a link can move the browser off Gala.
    if (!to.startsWith("/") || to.startsWith("//")) return;
    window.history.pushState(null, "", to);
    setLocation(currentLocation());
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const context = useContext(RouterContext);
  if (context === null) throw new Error("useRouter needs a RouterProvider above it.");
  return context;
}

/** A link to another place in Gala that doesn't reload the page. */
export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const { navigate } = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
