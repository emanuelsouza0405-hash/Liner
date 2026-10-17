import { memo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings4Fill } from "@mingcute/react";
import { sidebarNavItems } from "../data/navigation";
import { useTranslation } from "@/languages";

interface MobileNavProps {
  searchOpen: boolean;
  settingsOpen: boolean;
  onSearchToggle: () => void;
  onSettingsToggle: () => void;
}

/** Barra de navegação inferior (substitui a Sidebar no celular). */
function MobileNav({
  searchOpen,
  settingsOpen,
  onSearchToggle,
  onSettingsToggle,
}: MobileNavProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const isRouteActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname === "/home"
      : pathname === href || pathname.startsWith(`${href}/`);

  const base =
    "flex flex-1 flex-col items-center justify-center gap-[2px] h-full border-0 bg-transparent p-0 cursor-pointer active:scale-95 transition-transform duration-100 text-text-primary";

  const label = (id: string, fallback: string) =>
    t(`common.sidebar.${id}`) || fallback;

  return (
    <nav
      className="flex shrink-0 items-stretch w-full h-[56px] bg-bg-primary rounded-sm"
      aria-label="Navegação principal"
    >
      {sidebarNavItems
        .filter((i) => i.id !== "settings")
        .map((item) => {
          const Icon = item.Icon;
          const active = item.id === "search" ? searchOpen : isRouteActive(item.href!);
          const inner = (
            <>
              <Icon size={24} className={active ? "opacity-100" : "opacity-55"} />
              <span className={`text-[10.5px] ${active ? "opacity-100 font-medium" : "opacity-55"}`}>
                {label(item.id, item.label)}
              </span>
            </>
          );
          return item.id === "search" ? (
            <button
              key={item.id}
              type="button"
              aria-pressed={searchOpen}
              onClick={onSearchToggle}
              className={base}
            >
              {inner}
            </button>
          ) : (
            <Link
              key={item.id}
              to={item.href!}
              aria-current={active ? "page" : undefined}
              className={base}
            >
              {inner}
            </Link>
          );
        })}
      <button
        type="button"
        aria-pressed={settingsOpen}
        onClick={onSettingsToggle}
        className={base}
      >
        <Settings4Fill size={24} className={settingsOpen ? "opacity-100" : "opacity-55"} />
        <span className={`text-[10.5px] ${settingsOpen ? "opacity-100 font-medium" : "opacity-55"}`}>
          {label("settings", "Settings")}
        </span>
      </button>
    </nav>
  );
}

export default memo(MobileNav);
