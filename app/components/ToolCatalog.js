'use client';

import { useState } from 'react';
import ToolCard from './ui/ToolCard';
import { CATEGORIES, TOOLS } from '@/lib/toolsData';

// Filterable grid of every tool, used on the landing page.
export default function ToolCatalog() {
  const [category, setCategory] = useState('all');
  const visible = category === 'all' ? TOOLS : TOOLS.filter((tool) => tool.category === category);

  return (
    <>
      <div className="filter-tabs" role="group" aria-label="Filter tools by category">
        <button type="button" className="filter-tab" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
          All tools
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className="filter-tab" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="tool-grid">
        {visible.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
      </div>
    </>
  );
}
