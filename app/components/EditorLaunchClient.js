'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2 } from 'lucide-react';
import ToolShell from './ToolShell';
import { useAuthUser } from '@/app/utils/useAuthUser';
import { isPdfFile } from '@/app/utils/files';
import { createWorkspaceDocument } from '@/lib/documents';
import { warmBackend } from '@/app/utils/useBackendStatus';

const COPY = {
  sign: {
    title: 'Select a PDF to sign',
    hint: 'Draw, type or upload your signature, add initials, dates and check marks',
  },
  redact: {
    title: 'Select a PDF to redact',
    hint: 'Find names, emails and numbers, or mark any area — it is removed for good',
  },
};

/**
 * Entry point for tools that happen in the editor (Sign, Redact): saves the PDF to the
 * workspace and opens the editor with the right tool ready.
 */
export default function EditorLaunchClient({ toolId, mode }) {
  const router = useRouter();
  const { user } = useAuthUser();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[mode];

  const open = async ([file]) => {
    setError('');
    if (!isPdfFile(file)) {
      setError('Please choose a PDF file.');
      return;
    }
    if (!user) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    setUploading(true);
    // Redaction is applied by the conversion server on download; wake it early.
    if (mode === 'redact') warmBackend();
    try {
      const id = await createWorkspaceDocument(user, file);
      router.push(`/editor/${id}?mode=${mode}`);
    } catch (err) {
      setError(err.message || 'Could not upload the PDF.');
      setUploading(false);
    }
  };

  return (
    <ToolShell
      toolId={toolId}
      stage="select"
      processing="workspace"
      error={error}
      dropzone={{
        accept: 'application/pdf,.pdf',
        onFiles: open,
        title: uploading ? 'Opening the editor…' : copy.title,
        hint: copy.hint,
        disabled: uploading,
        icon: FilePlus2,
      }}
    />
  );
}
