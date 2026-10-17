import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "@/features/home/ui/HomePage";
import PlayerPage from "@/features/player/ui/FullscreenPlayer";

// Páginas secundárias carregam sob demanda: o app abre mais rápido no celular.
const LibraryPage = lazy(() => import("@/features/library/ui/LibraryPage"));
const PlaylistPage = lazy(() => import("@/features/library/ui/PlaylistPage"));
const ArtistPage = lazy(() => import("@/features/artist/ui/ArtistPage"));
const CollectionPage = lazy(() => import("@/features/collection/ui/CollectionPage"));
const LoginPage = lazy(() => import("@/features/auth/ui/LoginPage"));

const lazyEl = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/library" element={lazyEl(<LibraryPage />)} />
      <Route path="/library/playlist" element={lazyEl(<PlaylistPage />)} />
      <Route path="/artist" element={lazyEl(<ArtistPage />)} />
      <Route path="/collection" element={lazyEl(<CollectionPage />)} />
      <Route path="/login" element={lazyEl(<LoginPage />)} />
      <Route path="/settings" element={<Navigate to="/" replace />} />
      <Route path="/player" element={<PlayerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
