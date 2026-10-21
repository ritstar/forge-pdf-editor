'use client';

import { useEffect, useRef, useState } from 'react';
import { Page } from 'react-pdf';

// Renders a react-pdf <Page> only once it scrolls near the viewport, so documents with
// hundreds of pages don't rasterize every thumbnail up front.
export default function LazyPage({ pageNumber, width, rotate, placeholderRatio = 1.294 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const placeholder = <div className="skeleton" style={{ width, height: Math.round(width * placeholderRatio) }} />;

  return (
    <div ref={ref}>
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          rotate={rotate}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={placeholder}
        />
      ) : (
        placeholder
      )}
    </div>
  );
}
