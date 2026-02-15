import EditorClientPage from '@/app/components/EditorClientPage';

export default async function DocumentEditorPage({ params }) {
  const { documentId } = await params;
  return <EditorClientPage documentId={documentId} />;
}
