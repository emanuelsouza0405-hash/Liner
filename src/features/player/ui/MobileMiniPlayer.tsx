import { memo } from "react";
import { Play, Pause, SkipNext, SkipPrevious } from "@solar-icons/react";
import AppImage from "@/features/covers/ui/AppImage";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";

interface MobileMiniPlayerProps {
  onFullscreenOpen: () => void;
}

/** Mini player compacto para celular: toque abre o player completo. */
function MobileMiniPlayer({ onFullscreenOpen }: MobileMiniPlayerProps) {
  const player = usePlayerState();
  const track = player.currentTrack;
  if (!track) return null;

  const loading = player.status === "loading";
  const playing = player.status === "playing";
  const pct =
    player.durationMs > 0
      ? Math.min(100, (player.positionMs / player.durationMs) * 100)
      : 0;

  const stop = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.stopPropagation();
    fn();
  };

  const btn =
    "inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border-none bg-transparent text-text-primary cursor-pointer active:scale-90 transition-transform";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onFullscreenOpen}
      className="relative flex h-[60px] w-full items-center gap-[10px] overflow-hidden rounded-xl bg-bg-primary pl-[10px] pr-[4px] cursor-pointer"
    >
      <AppImage
        src={track.coverUrl}
        alt=""
        width={42}
        height={42}
        className="h-[42px] w-[42px] shrink-0 rounded-[8px] object-cover bg-bg-elevated"
        draggable={false}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium text-text-primary">
          {track.title}
        </span>
        <span className="truncate text-[12px] text-text-tertiary">
          {track.artists}
        </span>
      </div>
      <button
        type="button"
        aria-label="Anterior"
        className={btn}
        onClick={stop(() => void playerEngine.skipPrevious())}
      >
        <SkipPrevious size={22} weight="Bold" />
      </button>
      <button
        type="button"
        aria-label={playing ? "Pausar" : "Tocar"}
        className={btn}
        onClick={stop(() => playerEngine.togglePlayPause())}
      >
        {loading ? (
          <span className="h-[18px] w-[18px] animate-spin rounded-full border-[2px] border-current border-t-transparent" />
        ) : playing ? (
          <Pause size={24} weight="Bold" />
        ) : (
          <Play size={24} weight="Bold" />
        )}
      </button>
      <button
        type="button"
        aria-label="Próxima"
        className={btn}
        onClick={stop(() => void playerEngine.skipNext())}
      >
        <SkipNext size={22} weight="Bold" />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-border-primary">
        <div
          className="h-full bg-text-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default memo(MobileMiniPlayer);
