import { useEffect, useRef, useState } from 'react';

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

