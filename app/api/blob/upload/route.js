import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const path = form.get('path');

    if (!file || !path) {
      return NextResponse.json({ error: 'File or path missing' }, { status: 400 });
    }

    const blob = await put(path, file, { access: 'public' });
    
    return NextResponse.json(blob);
  } catch (error) {
    console.error('Vercel Blob Direct Upload Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
