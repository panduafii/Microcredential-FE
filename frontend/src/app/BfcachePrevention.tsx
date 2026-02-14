"use client";
import { useEffect } from "react";

/**
 * Component to prevent browser back/forward cache (bfcache) for security
 * This ensures auth checks always run fresh, not from cached pages
 */
export default function BfcachePrevention() {
  useEffect(() => {
    // Detect if page loaded from bfcache and force reload
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log("[Security] Page restored from bfcache, force reloading");
        window.location.reload();
      }
    };

    // Mark page as unload-eligible (prevents bfcache)
    const handleBeforeUnload = () => {
      // Just the presence of this listener can prevent bfcache
    };
    
    // Additional unload handler (prevents Firefox bfcache)
    const handleUnload = () => {
      // Just having this listener helps prevent bfcache
    };

    window.addEventListener("pageshow", handlePageShow as EventListener);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleUnload);

    return () => {
      window.removeEventListener("pageshow", handlePageShow as EventListener);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("unload", handleUnload);
    };
  }, []);

  return null;
}
