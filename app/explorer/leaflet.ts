declare global {
  interface Window {
    L?: Record<string, (...args: unknown[]) => unknown>;
  }
}

let loading: Promise<void> | null = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-leaflet]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("La carte est indisponible")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/vendor/leaflet.js";
    script.dataset.leaflet = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("La carte est indisponible"));
    document.head.appendChild(script);
  });

  return loading;
}
