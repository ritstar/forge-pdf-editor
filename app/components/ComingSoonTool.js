'use client';

import { Wrench } from 'lucide-react';
import { TOOLS } from '@/lib/toolsData';

export default function ComingSoonTool({ toolId }) {
    const toolData = TOOLS.find(t => t.id === toolId);
    const Icon = toolData?.icon || Wrench;

    return (
        <div style={{ maxWidth: '800px', margin: '100px auto 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
            <div style={{
                color: toolData?.color || 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `${toolData?.color || 'var(--accent)'}15`,
                padding: '24px',
                borderRadius: '24px'
            }}>
                <Icon size={64} />
            </div>

            <div>
                <h1 style={{ fontSize: '3rem', margin: '0 0 16px' }}>
                    {toolData?.name || 'Coming Soon'}
                </h1>
                <p className="muted" style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto 24px' }}>
                    {toolData?.description}
                </p>

                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    padding: '24px',
                    borderRadius: '12px',
                    display: 'inline-block'
                }}>
                    <h3 style={{ margin: '0 0 8px' }}>🚀 Advanced Feature Pipeline</h3>
                    <p className="muted small" style={{ margin: 0, maxWidth: '400px' }}>
                        This feature requires backend processing (e.g., OCR, format conversion engines) and is currently in development. It will be available in a future update!
                    </p>
                </div>
            </div>
        </div>
    );
}
