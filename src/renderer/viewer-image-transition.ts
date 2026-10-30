/** A decoded image held above both the browse canvas and viewer during handoff. */
export interface PhotoFlight {
  element: HTMLImageElement;
  remove(): void;
}

/** Image pixels inside a contain-fit card, excluding the card's letterbox. */
export function containedPhotoRect(box: DOMRect, width: number, height: number): DOMRect {
  if (width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return box;
  const scale = Math.min(box.width / width, box.height / height);
  const w = width * scale;
  const h = height * scale;
  return new DOMRect(box.left + (box.width - w) / 2, box.top + (box.height - h) / 2, w, h);
}

/** Only corners touching the card's clipped corners inherit its radius. */
export function cardPhotoRadius(card: HTMLElement, photo: DOMRect): string {
  const box = card.getBoundingClientRect();
  const style = getComputedStyle(card);
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  const left = near(photo.left, box.left);
  const right = near(photo.right, box.right);
  const top = near(photo.top, box.top);
  const bottom = near(photo.bottom, box.bottom);
  return [
    left && top ? style.borderTopLeftRadius : "0px",
    right && top ? style.borderTopRightRadius : "0px",
    right && bottom ? style.borderBottomRightRadius : "0px",
    left && bottom ? style.borderBottomLeftRadius : "0px",
  ].map((radius) => radius || "0px").join(" ");
}

export function createPhotoFlight(image: HTMLImageElement | null, rect: DOMRect | null, radius = "0px"): PhotoFlight | null {
  if (!image || !rect || !image.complete || !image.naturalWidth || rect.width < 1 || rect.height < 1 ||
      rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const copy = image.cloneNode(false) as HTMLImageElement;
  copy.removeAttribute("id");
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "fixed", zIndex: "2147483647", pointerEvents: "none", margin: "0",
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    maxWidth: "none", maxHeight: "none", transform: "none", translate: "none", objectFit: "contain",
    borderRadius: radius, opacity: "1", visibility: "visible", willChange: "transform, border-radius",
  });
  document.body.appendChild(copy);
  return { element: copy, remove: () => copy.remove() };
}

export async function movePhotoFlight(flight: PhotoFlight, from: DOMRect, to: DOMRect, fromRadius = "0px", toRadius = "0px"): Promise<void> {
  if (from.width < 1 || from.height < 1 || to.width < 1 || to.height < 1) return;
  // Uniform scaling preserves the photo's proportions. Centering also absorbs
  // subpixel rounding or a small aspect difference between thumbnail and source.
  const scale = Math.min(to.width / from.width, to.height / from.height);
  const x = to.left + (to.width - from.width * scale) / 2 - from.left;
  const y = to.top + (to.height - from.height * scale) / 2 - from.top;
  // A scaled element scales its CSS corner radius as well; compensate so the
  // visible final radius still matches the card on the return journey.
  const scaledRadius = toRadius.replace(/([\d.]+)px/g, (_, value: string) => `${Number(value) / scale}px`);
  const animation = flight.element.animate([
    { transform: "translate(0, 0) scale(1)", transformOrigin: "top left", borderRadius: fromRadius },
    { transform: `translate(${x}px, ${y}px) scale(${scale})`, transformOrigin: "top left", borderRadius: scaledRadius },
  ], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" });
  try { await animation.finished; } catch { /* interrupted by navigation */ }
}
