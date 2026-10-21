'use client';

import dynamic from 'next/dynamic';

// react-pdf needs browser APIs, so this tool renders on the client only.
const WatermarkClient = dynamic(() => import('./WatermarkClient'), { ssr: false });

export default function WatermarkPage() {
    return <WatermarkClient />;
}
