import { useSyncExternalStore } from "react";
import { getIsMobile } from "@/shared/platform";

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(max-width: 820px)");
  mq.addEventListener("change", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener("orientationchange", cb);
  };
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getIsMobile, () => false);
}
