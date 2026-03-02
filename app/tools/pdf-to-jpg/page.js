'use client';

import dynamic from 'next/dynamic';

const PdfToJpgClient = dynamic(() => import('./PdfToJpgClient'), {
    ssr: false,
});

export default function PdfToJpgPage() {
    return <PdfToJpgClient />;
}
