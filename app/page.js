'use client';

import dynamic from 'next/dynamic';

const ForgeEditor = dynamic(() => import('./components/ForgeEditor'), {
  ssr: false,
});

export default function Page() {
  return <ForgeEditor />;
}
