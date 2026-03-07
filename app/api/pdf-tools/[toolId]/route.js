import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_TOOL_IDS = new Set([
  'compress-pdf',
  'pdf-to-word',
  'pdf-to-powerpoint',
  'pdf-to-excel',
  'word-to-pdf',
  'powerpoint-to-pdf',
  'excel-to-pdf',
  'html-to-pdf',
  'unlock-pdf',
  'protect-pdf',
  'pdf-to-pdfa',
  'repair-pdf',
]);

function backendUrl() {
  return (process.env.PDF_TOOLS_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
}

export async function POST(request, { params }) {
  const { toolId } = await params;

  if (!ALLOWED_TOOL_IDS.has(toolId)) {
    return NextResponse.json({ error: 'Unsupported tool.' }, { status: 404 });
  }

  try {
    const form = await request.formData();

    const upstream = await fetch(`${backendUrl()}/tools/${toolId}`, {
      method: 'POST',
      body: form,
      cache: 'no-store',
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    if (!upstream.ok) {
      if (contentType.includes('application/json')) {
        const json = await upstream.json();
        return NextResponse.json(json, { status: upstream.status });
      }

      const text = await upstream.text();
      return NextResponse.json(
        { error: text || 'Backend tool request failed.' },
        { status: upstream.status }
      );
    }

    const headers = new Headers();
    headers.set('content-type', contentType);

    const contentDisposition = upstream.headers.get('content-disposition');
    if (contentDisposition) {
      headers.set('content-disposition', contentDisposition);
    }

    const data = await upstream.arrayBuffer();
    return new NextResponse(data, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to proxy tool request.' },
      { status: 500 }
    );
  }
}
