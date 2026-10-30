// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cardPhotoRadius, containedPhotoRect, createPhotoFlight, movePhotoFlight } from "../../src/renderer/viewer-image-transition";

describe("photo transition handoff", () => {
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
  it("uses the actual contained photo bounds rather than its letterboxed card", () => {
    const result = containedPhotoRect(new DOMRect(10, 20, 200, 200), 400, 200);
    expect([result.left, result.top, result.width, result.height]).toEqual([10, 70, 200, 100]);
  });
  it("inherits the card corners only where the photo touches them", () => {
    const card = document.createElement("div");
    card.style.borderRadius = "8px";
    card.getBoundingClientRect = () => new DOMRect(10, 20, 200, 200);
    document.body.append(card);
    expect(cardPhotoRadius(card, new DOMRect(10, 20, 200, 200))).toBe("8px 8px 8px 8px");
    expect(cardPhotoRadius(card, new DOMRect(10, 70, 200, 100))).toBe("0px 0px 0px 0px");
  });
  it("keeps the islands toolbar in flex layout through viewing and restoring", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/renderer/styles.css", "utf8");
    document.head.append(style);
    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.dataset.shellLayout = "islands";
    shell.innerHTML = '<section class="workspace" data-photo-return="active"><div class="workspace-toolstrip is-viewing"><div class="workspace-bar"></div><div class="workspace-discovery"></div></div></section>';
    document.body.append(shell);
    const toolbar = shell.querySelector<HTMLElement>(".workspace-toolstrip")!;
    expect(getComputedStyle(toolbar).display).toBe("flex");
    toolbar.className = "workspace-toolstrip is-restoring";
    expect(getComputedStyle(toolbar).display).toBe("flex");
    toolbar.className = "workspace-toolstrip";
    shell.querySelector<HTMLElement>(".workspace")!.removeAttribute("data-photo-return");
    expect(getComputedStyle(toolbar).display).toBe("flex");
    style.remove();
  });
  it("keeps the decoded flight image mounted after animation until handoff removes it", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    const source = document.createElement("img");
    Object.defineProperties(source, { complete: { value: true }, naturalWidth: { value: 400 } });
    source.src = "https://example.test/image.png";
    const from = new DOMRect(10, 20, 100, 80);
    const to = new DOMRect(50, 70, 400, 320);
    const flight = createPhotoFlight(source, from);
    expect(flight).not.toBeNull();
    const animation = { finished: Promise.resolve() };
    const animate = vi.fn((frames: Keyframe[] | PropertyIndexedKeyframes | null) => {
      void frames;
      return animation as unknown as Animation;
    });
    flight!.element.animate = animate;
    await movePhotoFlight(flight!, from, to, "8px", "0px");
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]?.[0]).toMatchObject([
      { transform: "translate(0, 0) scale(1)", borderRadius: "8px" },
      { transform: "translate(40px, 50px) scale(4)", borderRadius: "0px" },
    ]);
    expect(flight!.element.isConnected).toBe(true);
    flight!.remove();
    expect(flight!.element.isConnected).toBe(false);
  });
  it("skips motion for reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const source = document.createElement("img");
    Object.defineProperties(source, { complete: { value: true }, naturalWidth: { value: 400 } });
    expect(createPhotoFlight(source, new DOMRect(0, 0, 100, 100))).toBeNull();
  });
});
