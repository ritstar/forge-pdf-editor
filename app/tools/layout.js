'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import ForgeLogo from '@/app/components/ForgeLogo';
import Footer from '@/app/components/Footer';

export default function ToolsLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const [theme, setTheme] = useState(() => {
        if (typeof document === 'undefined') return 'light';
        return document.documentElement.getAttribute('data-theme') || 'light';
    });

    useEffect(() => {
        if (typeof document === 'undefined') return;
        document.documentElement.setAttribute('data-theme', theme);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('forge-theme', theme);
        }
    }, [theme]);

    // Don't wrap in layout if we somehow hit the root /tools (though we probably won't)
    if (pathname === '/tools') return children;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    background: 'var(--surface)',
                    borderBottom: '1px solid var(--line)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={() => router.back()} className="ghost-btn" style={{ padding: '8px', minHeight: 'auto' }} aria-label="Go back">
                        <ArrowLeft size={18} />
                    </button>
                    <ForgeLogo href="/app" compact />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        className="ghost-btn theme-toggle"
                        type="button"
                        onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        style={{ padding: '8px', minHeight: 'auto' }}
                    >
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <Link href="/app" className="primary-btn" style={{ padding: '8px 16px', minHeight: 'auto', fontSize: '0.9rem' }}>
                        Dashboard
                    </Link>
                </div>
            </header>
            <main style={{ flex: 1, padding: '32px 24px', width: 'min(1200px, 100%)', margin: '0 auto' }}>
                {children}
            </main>
            <Footer />
        </div>
    );
}
