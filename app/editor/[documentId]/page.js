import EditorClientPage from '@/app/components/EditorClientPage';

const MODES = new Set(['sign', 'redact', 'edit-text']);

export default async function DocumentEditorPage({ params, searchParams }) {
  const { documentId } = await params;
  const { mode } = await searchParams;
  return <EditorClientPage documentId={documentId} initialTool={MODES.has(mode) ? mode : null} />;
}
