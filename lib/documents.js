import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase/config';
import { uploadToBlob } from './blobClient';
import { sanitizeName } from './sanitize';

/** Uploads a PDF to the user's workspace and returns the new document's id. */
export async function createWorkspaceDocument(user, file) {
  const cleanName = `${sanitizeName(file.name.replace(/\.pdf$/i, '')) || 'document'}.pdf`;
  const blobPath = `documents/${user.uid}/${crypto.randomUUID()}-${cleanName}`;
  const blob = await uploadToBlob(blobPath, file, 'application/pdf');
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, 'documents'), {
    user_id: user.uid,
    title: file.name,
    file_path: blob.url,
    file_size: file.size,
    mime_type: 'application/pdf',
    status: 'draft',
    created_at: now,
    updated_at: now,
  });
  return docRef.id;
}
