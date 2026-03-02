'use client';

import dynamic from 'next/dynamic';

const RotateClient = dynamic(() => import('./RotateClient'), {
    ssr: false,
});

export default function RotatePage() {
    return <RotateClient />;
}
