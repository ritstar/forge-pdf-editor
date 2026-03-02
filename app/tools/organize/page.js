'use client';

import dynamic from 'next/dynamic';

const OrganizeClient = dynamic(() => import('./OrganizeClient'), {
    ssr: false,
});

export default function OrganizePage() {
    return <OrganizeClient />;
}
