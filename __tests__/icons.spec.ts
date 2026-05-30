import { describe, it, expect } from "vitest";
import { getModeIcon, VIEW_MODE_ICON_DEFAULTS } from "../src/lib/icons";

const defaults = {
  iconReading: VIEW_MODE_ICON_DEFAULTS.reading,
  iconLive: VIEW_MODE_ICON_DEFAULTS.live,
  iconSource: VIEW_MODE_ICON_DEFAULTS.source,
};

const custom = {
  iconReading: "eye",
  iconLive: "pencil",
  iconSource: "terminal",
};

describe("getModeIcon", () => {
  it("returns reading icon for reading mode", () => {
    expect(getModeIcon("reading", defaults)).toBe("book-open");
    expect(getModeIcon("current view: reading", defaults)).toBe("book-open");
  });

  it("returns live icon for live mode", () => {
    expect(getModeIcon("live", defaults)).toBe("pen-tool");
    expect(getModeIcon("current view: live", defaults)).toBe("pen-tool");
  });

  it("returns source icon for source mode", () => {
    expect(getModeIcon("source", defaults)).toBe("code");
    expect(getModeIcon("current view: source", defaults)).toBe("code");
  });

  it("returns lock for unknown mode", () => {
    expect(getModeIcon("unknown", defaults)).toBe("lock");
    expect(getModeIcon("", defaults)).toBe("lock");
  });

  it("uses custom icons from settings", () => {
    expect(getModeIcon("reading", custom)).toBe("eye");
    expect(getModeIcon("live", custom)).toBe("pencil");
    expect(getModeIcon("source", custom)).toBe("terminal");
  });
});
