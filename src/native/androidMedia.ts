/**
 * Ponte JS <-> Android para reprodução em 2º plano.
 *
 * O lado nativo (android-native/LinerMediaPlugin.kt + LinerMediaService.kt) mantém
 * um Foreground Service com MediaSession + notificação de mídia (play/pause/
 * anterior/próxima/seek, tela de bloqueio, fone Bluetooth) e trava o aparelho
 * de suspender a rede/CPU enquanto toca. Aqui só enviamos o ESTADO e recebemos
 * as AÇÕES. Nada disso roda fora do app Android (no PC/Electron é no-op).
 */
import { isNative, isAndroid } from "@/shared/platform";
import { usePlayerStore } from "@/features/player/store/playerStore";

type MediaActionName =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "seek"
  | "stop";

interface MediaActionEvent {
  action: MediaActionName;
  positionMs?: number;
}

interface LinerMediaPlugin {
  updateMetadata(o: {
    title: string;
    artist: string;
    album: string;
    artworkUrl: string;
    durationMs: number;
  }): Promise<void>;
  updateState(o: {
    state: "playing" | "paused" | "buffering" | "stopped";
    positionMs: number;
    durationMs: number;
    rate: number;
  }): Promise<void>;
  stop(): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  addListener(
    name: "mediaAction",
    cb: (e: MediaActionEvent) => void,
  ): Promise<{ remove: () => void }>;
}

function getPlugin(): LinerMediaPlugin | null {
  if (!isNative || !isAndroid) return null;
  const cap = (window as any).Capacitor;
  return (cap?.Plugins?.LinerMedia ?? cap?.registerPlugin?.("LinerMedia") ?? null) as
    | LinerMediaPlugin
    | null;
}

let started = false;

export function initAndroidMedia(): void {
  if (started) return;
  const plugin = getPlugin();
  if (!plugin) return;
  started = true;

  // Android 13+: permissão para mostrar a notificação do player
  void plugin.requestNotificationPermission().catch(() => {});

  // ---- ações vindas da notificação / tela de bloqueio / fone ----
  void plugin.addListener("mediaAction", (e) => {
    const { dispatch } = usePlayerStore.getState();
    switch (e.action) {
      case "play":
        dispatch({ type: "RESUME_REQUESTED" });
        break;
      case "pause":
      case "stop":
        dispatch({ type: "PAUSE_REQUESTED" });
        break;
      case "next":
        dispatch({ type: "SKIP_NEXT" });
        break;
      case "previous":
        dispatch({ type: "SKIP_PREVIOUS" });
        break;
      case "seek":
        if (typeof e.positionMs === "number") {
          dispatch({ type: "SEEK_COMMITTED", positionMs: Math.round(e.positionMs) });
        }
        break;
    }
  });

  // ---- estado JS -> nativo (só quando algo muda; sem polling) ----
  let lastTrackId: string | null = null;
  let lastKey = "";
  let metaHadDuration = false;

  const pushState = () => {
    const s = usePlayerStore.getState();
    const track = s.currentTrack;

    if (!track || s.status === "idle") {
      if (lastTrackId !== null) {
        lastTrackId = null;
        lastKey = "";
        void plugin.stop().catch(() => {});
      }
      return;
    }

    const durKnown = s.durationMs > 0;
    if (track.id !== lastTrackId || (durKnown && !metaHadDuration)) {
      if (track.id !== lastTrackId) metaHadDuration = false;
      lastTrackId = track.id;
      metaHadDuration = durKnown;
      void plugin
        .updateMetadata({
          title: track.title ?? "",
          artist: track.artists ?? "",
          album: (track as { albumTitle?: string }).albumTitle ?? "Liner",
          artworkUrl: track.coverUrl ?? "",
          durationMs: s.durationMs || 0,
        })
        .catch(() => {});
    }

    const state =
      s.status === "playing"
        ? "playing"
        : s.status === "loading"
          ? "buffering"
          : "paused";
    const rate = s.playbackRate ?? 1;
    const key = `${track.id}|${state}|${rate}|${Math.round(s.durationMs / 1000)}`;
    if (key === lastKey) return;
    lastKey = key;

    void plugin
      .updateState({
        state,
        positionMs: Math.round(s.positionMs),
        durationMs: Math.round(s.durationMs),
        rate,
      })
      .catch(() => {});
  };

  usePlayerStore.subscribe(pushState);

  // seek manual: reenvia a posição (o Android interpola o resto sozinho)
  const audio = (window as any).__liner_audio as HTMLAudioElement | undefined;
  audio?.addEventListener("seeked", () => {
    lastKey = "";
    pushState();
  });
}

/** Botão voltar do Android: fecha o que estiver aberto; senão minimiza (a música continua). */
export function registerBackButton(handler: () => boolean): () => void {
  if (!isNative) return () => {};
  const cap = (window as any).Capacitor;
  const App = cap?.Plugins?.App;
  if (!App?.addListener) return () => {};
  let remove: (() => void) | null = null;
  let disposed = false;
  void Promise.resolve(
    App.addListener("backButton", () => {
      if (handler()) return;
      void App.minimizeApp?.();
    }),
  ).then((h: { remove: () => void }) => {
    if (disposed) h.remove();
    else remove = () => h.remove();
  });
  return () => {
    disposed = true;
    remove?.();
  };
}

export function askIgnoreBatteryOptimizations(): void {
  void getPlugin()?.requestIgnoreBatteryOptimizations().catch(() => {});
}
