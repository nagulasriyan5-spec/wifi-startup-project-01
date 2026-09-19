export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error) => {
        console.warn("[pwa] Service worker registration failed", error);
      });
  });
}
