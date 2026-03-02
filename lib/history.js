import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase/config';

export async function logToolAction(userId, toolId, toolName, fileName) {
    if (!userId) return;

    try {
        await addDoc(collection(db, 'tool_history'), {
            user_id: userId,
            tool_id: toolId,
            tool_name: toolName,
            file_name: fileName,
            created_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('Unexpected error logging tool history:', err);
    }
}
