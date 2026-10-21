'use client';

import { useEffect, useRef, useState } from 'react';

// Small accessible dropdown: closes on outside click, Escape, or choosing an item.
export default function Menu({ trigger, children, align = 'right', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`menu-anchor ${className}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open ? (
        <div
          className="menu"
          role="menu"
          style={align === 'left' ? { left: 0, right: 'auto' } : undefined}
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
