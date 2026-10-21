import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function ToolCard({ tool, compact = false }) {
  const Icon = tool.icon;
  return (
    <Link href={tool.href} className={`tool-card ${compact ? 'compact' : ''}`}>
      <span className={`icon-tile ${compact ? 'sm' : ''}`} style={{ '--tile': tool.color }}>
        <Icon size={compact ? 17 : 20} />
      </span>
      <span style={{ minWidth: 0 }}>
        <h3>{tool.name}</h3>
        <p>{tool.description}</p>
      </span>
      <ArrowRight className="tool-card-arrow" size={16} aria-hidden="true" />
    </Link>
  );
}
