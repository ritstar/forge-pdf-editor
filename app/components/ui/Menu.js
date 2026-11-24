'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MENU_WIDTH = 232;

/**
 * Small accessible dropdown: closes on outside click, Escape, or choosing an item; arrow keys
 * move between items. `fixed` positions it against the viewport so it isn't clipped by a
 * scrolling container (like the editor's tool strip).
 */
export default function Menu({ trigger, children, align = 'right', className = '', fixed = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);

  const toggle = () => setOpen((v) => !v);

  useLayoutEffect(() => {
    if (!open || !fixed || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const left = align === 'left' ? rect.left : rect.right - MENU_WIDTH;
    setPosition({
      position: 'fixed',
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8)),
      right: 'auto',
    });
  }, [open, fixed, align]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next].focus();
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    if (fixed) {
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
    }
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, fixed]);

  const style = fixed && position ? position : align === 'left' ? { left: 0, right: 'auto' } : undefined;

  return (
    <div className={`menu-anchor ${className}`} ref={ref}>
      {trigger({ open, toggle, 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open ? (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          style={style}
          onClick={(event) => {
            if (event.target.closest('[role="menuitem"]')) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
