import { useEffect, useRef, useState } from 'react';

/**
 * [ref, width]: the element's current content width, kept up to date. A
 * callback ref, so it starts measuring whenever the element mounts (charts
 * render an empty state first and the plot later).
 */
export function useWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

/**
 * Rows per page from the space a list actually has, so a page never
 * scrolls: the list pages instead. Returns [ref, pageSize].
 */
export function usePageSize(rowHeight, { min = 3, columns = 1, gap = 0 } = {}) {
  const ref = useRef(null);
  const [size, setSize] = useState(min * columns);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const calc = () => {
      const rows = Math.max(min, Math.floor((el.clientHeight + gap) / (rowHeight + gap)));
      setSize(rows * columns);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight, min, columns, gap]);
  return [ref, size];
}


/** The element line-chart hover cards are portalled into (see ./HoverLayer.jsx): [element, ref callback]. */
export function useHoverLayer() {
  const [layer, setLayer] = useState(null);
  return [layer, setLayer];
}

/**
 * Fixed-size pages over a list: { page, pages, shown, setPage, size }.
 * Changing `resetKey` (the filters) starts again at page one; a page past the end
 * (after a delete) falls back to the last one.
 */
export const PAGE_SIZE = 10;
export function usePaged(rows, resetKey, size = PAGE_SIZE) {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(state.key === resetKey ? state.page : 0, pages - 1);
  return {
    page, pages, size,
    shown: rows.slice(page * size, page * size + size),
    setPage: (n) => setState({ key: resetKey, page: n }),
  };
}
