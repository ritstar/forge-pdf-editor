'use client';

import dynamic from 'next/dynamic';

// react-pdf needs browser APIs, so this tool renders on the client only.
const SplitClient = dynamic(() => import('./SplitClient'), { ssr: false });

export default function SplitPdfPage() {
    return <SplitClient />;
}
