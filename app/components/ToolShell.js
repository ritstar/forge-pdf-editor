'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import Dropzone from './ui/Dropzone';
import ToolCard from './ui/ToolCard';
import { getRelatedTools, getTool } from '@/lib/toolsData';

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={16} />
      <div>{children}</div>
    </div>
  );
}

function Breadcrumbs({ tool }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/app">Dashboard</Link>
      <ChevronRight size={14} />
      <Link href="/app#tools">Tools</Link>
      <ChevronRight size={14} />
      <span style={{ color: 'var(--ink)' }}>{tool.name}</span>
    </nav>
  );
}

/**
 * Consistent frame for every tool:
 *  - "select" stage: title, big dropzone, assurances, related tools
 *  - "work" stage: workspace (children) + sticky panel with options and the primary action
 */
export default function ToolShell({
  toolId,
  stage,
  dropzone,
  onReset,
  workspaceTitle,
  workspaceSubtitle,
  workspaceActions,
  panel,
  processing = 'browser',
  error,
  selectExtra,
  notice,
  children,
}) {
  const tool = getTool(toolId);
  const Icon = tool.icon;
  const related = getRelatedTools(toolId);

  if (stage === 'select') {
    return (
      <>
        <Breadcrumbs tool={tool} />
        <div className="tool-intro">
          <span className="icon-tile lg" style={{ '--tile': tool.color }}>
            <Icon size={26} />
          </span>
          <h1>{tool.name}</h1>
          <p>{tool.description}</p>
        </div>
        <div className="tool-landing">
          {notice}
          <Dropzone {...dropzone} />
          <div className="tool-assurances">
            {processing === 'browser' ? (
              <span><ShieldCheck size={15} /> Processed in your browser — files never leave your device</span>
            ) : (
              <span><ShieldCheck size={15} /> Encrypted transfer, files deleted right after processing</span>
            )}
            <span><Zap size={15} /> No watermarks, no installs</span>
          </div>
          {error ? <div style={{ marginTop: 16 }}><Alert>{error}</Alert></div> : null}
          {selectExtra}
        </div>
        {related.length ? (
          <section className="related">
            <h2>Related tools</h2>
            <div className="tool-grid">
              {related.map((item) => <ToolCard key={item.id} tool={item} compact />)}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  const action = panel?.action;

  return (
    <>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <Breadcrumbs tool={tool} />
          <h1 style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.45rem' }}>
            <span className="icon-tile sm" style={{ '--tile': tool.color }}><Icon size={17} /></span>
            {tool.name}
          </h1>
        </div>
        {onReset ? (
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            <RotateCcw size={15} /> Start over
          </button>
        ) : null}
      </div>

      <div className="workspace">
        <section className="workspace-main" aria-label="Files">
          {workspaceTitle ? (
            <div className="workspace-main-head">
              <div>
                <h2>{workspaceTitle}</h2>
                {workspaceSubtitle ? <p>{workspaceSubtitle}</p> : null}
              </div>
              {workspaceActions ? <div className="toolbar">{workspaceActions}</div> : null}
            </div>
          ) : null}
          {children}
        </section>

        <aside className="tool-panel" aria-label={`${tool.name} options`}>
          <div className="tool-panel-head">
            <span className="icon-tile sm" style={{ '--tile': tool.color }}><Icon size={17} /></span>
            <div>
              <h2>{panel?.title || tool.name}</h2>
              {panel?.subtitle ? <p>{panel.subtitle}</p> : null}
            </div>
          </div>
          {panel?.body ? <div className="tool-panel-body">{panel.body}</div> : null}
          <div className="tool-panel-foot">
            {notice}
            <Alert>{error}</Alert>
            {panel?.result ? <Alert kind="success">{panel.result}</Alert> : null}
            {action ? (
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={action.onClick}
                disabled={action.disabled || action.busy}
              >
                {action.busy ? (
                  <><Loader2 size={17} className="spin" /> {action.busyLabel || 'Processing…'}</>
                ) : (
                  <>{action.icon ? <action.icon size={17} /> : null} {action.label}</>
                )}
              </button>
            ) : null}
            {panel?.footnote ? <p className="small muted" style={{ textAlign: 'center' }}>{panel.footnote}</p> : null}
          </div>
        </aside>
      </div>
    </>
  );
}
