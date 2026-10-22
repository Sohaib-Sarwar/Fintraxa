/**
 * Make a non-semantic clickable element behave like a button.
 *
 * The app drives most of its navigation and toggles from `<Box onClick>` —
 * the top nav, the sidebar links, the bottom tabs, the expense/income toggle,
 * the stock rows. None of it could be reached from a keyboard and none of it
 * announced itself as interactive: a `div` with a click handler is invisible
 * to the tab order and to a screen reader.
 *
 * Spread this onto such an element and it becomes focusable, announces as a
 * button, and activates on both Enter and Space (Space is also prevented from
 * scrolling the page, which is what a real button does).
 *
 *   <Box {...clickable(() => navigate('/funds'), { label: 'Mutual funds' })}>
 *
 * Prefer a real `<Button>`/`<IconButton>` for new code; this is for the places
 * where the styling genuinely needs a bare box.
 */
export function clickable(onActivate, { label, selected, disabled = false } = {}) {
  if (disabled) {
    return { 'aria-disabled': true, tabIndex: -1 };
  }
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    ...(selected === undefined ? {} : { 'aria-current': selected ? 'page' : undefined }),
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      onActivate(e);
    },
  };
}

/** Same, for a two-state control such as a tab or a segmented toggle. */
export function selectable(onActivate, { label, selected } = {}) {
  return {
    role: 'tab',
    tabIndex: selected ? 0 : -1,
    'aria-selected': Boolean(selected),
    'aria-label': label,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      onActivate(e);
    },
  };
}
