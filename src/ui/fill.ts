// Progress bars that move every frame (Suspicion, Resolve, timers...) are drawn by scaling
// the fill sideways instead of changing its width: a width change makes the browser lay the
// whole page out again, every frame, which kept phones busy and warm. A transform doesn't.

const last = new WeakMap<HTMLElement, number>();

/** Show `share` (0 to 1) of a bar's fill. Writes only when it visibly changes. */
export function setFill(el: HTMLElement | null | undefined, share: number) {
  if (!el) return;
  const f = Math.round(Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0)) * 1000) / 1000;
  if (last.get(el) === f) return;
  if (!last.has(el)) {
    el.style.width = '100%';
    el.style.transformOrigin = 'left center';
    el.style.transition = 'none';
  }
  last.set(el, f);
  el.style.transform = `scaleX(${f})`;
}

const attrs = new WeakMap<Element, Map<string, string>>();

/** Set an attribute only when its value actually changes (the same value still costs a style pass). */
export function attr(el: Element | null | undefined, name: string, value: string) {
  if (!el) return;
  let m = attrs.get(el);
  if (!m) attrs.set(el, (m = new Map()));
  if (m.get(name) === value) return;
  m.set(name, value);
  el.setAttribute(name, value);
}
