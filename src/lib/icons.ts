import type { CurrentViewSettings } from "../config/settings";

export const VIEW_MODE_ICON_DEFAULTS = {
  reading: "book-open",
  live: "pen-tool",
  source: "code",
} as const;

export const getModeIcon = (
  mode: string,
  settings: Pick<CurrentViewSettings, "iconReading" | "iconLive" | "iconSource">
): string => {
  if (mode.includes("reading")) return settings.iconReading;
  if (mode.includes("live")) return settings.iconLive;
  if (mode.includes("source")) return settings.iconSource;
  return "lock";
};
