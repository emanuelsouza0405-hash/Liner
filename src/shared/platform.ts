/**
 * Detecção de plataforma + "modo leve" (performance).
 *
 * - isNative:   rodando dentro do app Capacitor (Android/iOS)
 * - isAndroid:  Android nativo (Capacitor) OU navegador Android
 * - isMobile:   celular/tablet pequeno (nativo OU tela estreita + toque)
 * - isElectron: versão desktop
 * - isLite:     reduz efeitos pesados (blur, WebGL, animações). Automático no
 *               celular; o usuário pode forçar via localStorage
 *               "liner_perf_mode" = "lite" | "full" | "auto".
 */

type PerfMode = "auto" | "lite" | "full";

const PERF_KEY = "liner_perf_mode";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const w = (typeof window !== "undefined" ? window : undefined) as
  | (Window & { Capacitor?: any; linerElectron?: unknown })
  | undefined;

export const isElectron = Boolean(w?.linerElectron);

export const isNative: boolean = (() => {
  try {
    return Boolean(w?.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
})();

export const isAndroid: boolean =
  (isNative && w?.Capacitor?.getPlatform?.() === "android") ||
  (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));

const MOBILE_QUERY = "(max-width: 820px)";

function computeIsMobile(): boolean {
  if (isElectron) return false;
  if (isNative) return true;
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia?.(MOBILE_QUERY)?.matches ?? false;
  const touch = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return narrow && touch;
}

/** Valor atual (reavalia ao redimensionar, ex.: girar o aparelho). */
export function getIsMobile(): boolean {
  return computeIsMobile();
}

export const isMobile: boolean = computeIsMobile();

export function getPerfMode(): PerfMode {
  const v = safeGet(PERF_KEY);
  return v === "lite" || v === "full" ? v : "auto";
}

export function setPerfMode(mode: PerfMode): void {
  try {
    localStorage.setItem(PERF_KEY, mode);
  } catch {
    // modo privado: vale só até recarregar
  }
  applyPlatformAttributes();
}

/** true quando devemos desligar efeitos caros. */
export function isLite(): boolean {
  const mode = getPerfMode();
  if (mode === "lite") return true;
  if (mode === "full") return false;
  if (isMobile) return true;
  // aparelhos fracos (poucos núcleos / pouca RAM) também entram em modo leve
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as any;
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  return cores <= 4 || mem <= 2;
}

/** Usuário pediu economia de dados / rede celular (evita cache pesado). */
export function isMeteredConnection(): boolean {
  const c = (typeof navigator !== "undefined" ? (navigator as any).connection : null) as
    | { saveData?: boolean; type?: string; effectiveType?: string }
    | null;
  if (!c) return false;
  return Boolean(c.saveData) || c.type === "cellular";
}

/** Marca <html> com data-platform / data-lite para o CSS reagir. */
export function applyPlatformAttributes(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.platform = isElectron
    ? "electron"
    : isNative
      ? isAndroid
        ? "android"
        : "native"
      : "web";
  root.dataset.mobile = computeIsMobile() ? "true" : "false";
  root.dataset.lite = isLite() ? "true" : "false";
}

if (typeof window !== "undefined") {
  applyPlatformAttributes();
  window.matchMedia?.(MOBILE_QUERY)?.addEventListener?.("change", applyPlatformAttributes);
}
