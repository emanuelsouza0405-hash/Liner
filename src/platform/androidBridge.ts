// Ponte Android (build pessoal): substitui o window.linerElectron do Electron.
// O signer WASM original é usado SEM modificação; só muda o carregador (async, sem Node/Buffer).
import { SIGNER_WASM_BASE64 } from "../../electron/signer";

type SignInput = { method: string; path: string; body?: string | null; timestamp?: number };
type Wasm = {
  liner_alloc: (n: number) => number;
  liner_dealloc: (p: number, n: number) => void;
  liner_get_result_ptr: () => number;
  liner_get_result_len: () => number;
  liner_sign_cover_url: (p: number, n: number) => number;
  liner_sign_request: (...a: any[]) => number;
  liner_sign_monitor_request: (...a: any[]) => number;
  liner_sign_raw_payload: (p: number, n: number) => number;
  memory: WebAssembly.Memory;
};

const enc = new TextEncoder();
const dec = new TextDecoder();
let offsetMs = 0;
let wasmP: Promise<Wasm> | null = null;

function loadWasm(): Promise<Wasm> {
  if (!wasmP) {
    const bin = atob(SIGNER_WASM_BASE64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    wasmP = WebAssembly.instantiate(bytes, {}).then((r) => r.instance.exports as unknown as Wasm);
  }
  return wasmP;
}

const ts = () => Math.floor((Date.now() + offsetMs) / 1000);
const nonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

function put(w: Wasm, bytes: Uint8Array) {
  const ptr = w.liner_alloc(bytes.length);
  new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
  return { ptr, len: bytes.length, free: () => w.liner_dealloc(ptr, bytes.length) };
}
function result(w: Wasm): string {
  const p = w.liner_get_result_ptr();
  const n = w.liner_get_result_len();
  return !p || n === 0 ? "" : dec.decode(new Uint8Array(w.memory.buffer, p, n));
}

async function sign(kind: "liner_sign_request" | "liner_sign_monitor_request", i: SignInput) {
  try {
    const w = await loadWasm();
    const t = i.timestamp ?? ts();
    const n = nonce();
    const m = put(w, enc.encode(i.method));
    const p = put(w, enc.encode(i.path));
    const b = put(w, enc.encode(i.body ?? ""));
    const nn = put(w, enc.encode(n));
    try {
      const code = w[kind](m.ptr, m.len, p.ptr, p.len, b.ptr, b.len, BigInt(t), nn.ptr, nn.len);
      if (code !== 0) return { error: `wasm ${kind} failed with code ${code}` };
      return { signature: result(w), timestamp: t, nonce: n };
    } finally {
      m.free(); p.free(); b.free(); nn.free();
    }
  } catch (e) {
    return { error: String(e) };
  }
}

export function installAndroidBridge() {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.() || (window as any).linerElectron) return;
  const noopOn = () => () => {};
  (window as any).linerElectron = {
    platform: "android",
    isHyprland: false,
    signRequest: (i: SignInput) => sign("liner_sign_request", i),
    signMonitorRequest: (i: SignInput) => sign("liner_sign_monitor_request", i),
    syncServerTime: async (v: string | number) => {
      const ms = typeof v === "number" ? v : Date.parse(v);
      if (!Number.isNaN(ms) && ms > 0) offsetMs = ms - Date.now();
      return offsetMs;
    },
    getServerTimeOffset: async () => offsetMs,
    signCoverUrl: async (payload: string) => {
      const w = await loadWasm();
      const b = put(w, enc.encode(payload));
      try {
        const code = w.liner_sign_cover_url(b.ptr, b.len);
        if (code !== 0) throw new Error(`sign_cover_url code ${code}`);
        return result(w);
      } finally { b.free(); }
    },
    signRawPayload: async (payload: number[] | Uint8Array) => {
      const w = await loadWasm();
      const b = put(w, Uint8Array.from(payload as ArrayLike<number>));
      try {
        const code = w.liner_sign_raw_payload(b.ptr, b.len);
        if (code !== 0) throw new Error(`sign_raw_payload code ${code}`);
        return result(w);
      } finally { b.free(); }
    },
    getAppVersion: async () => (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0") + "-android",
    onDeeplink: noopOn,
    onWindowStateChange: noopOn,
    isMaximized: async () => false,
    isFullScreen: async () => true, // esconde os botões de janela do desktop
  };
}
declare const __APP_VERSION__: string;
