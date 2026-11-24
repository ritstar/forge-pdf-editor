'use client';

import dynamic from 'next/dynamic';

// The live preview renders with pdf.js, which needs browser APIs.
const PageNumbersClient = dynamic(() => import('./PageNumbersClient'), { ssr: false });

export default function PageNumbersPage() {
    return <PageNumbersClient />;
}
