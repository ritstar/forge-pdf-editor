import { useRef } from 'react';
import { ImageIcon } from 'lucide-react';

export default function ImageUploader({ onUpload }) {
    const fileInputRef = useRef(null);

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
            // Reset input so same file can be selected again if needed
            e.target.value = '';
        }
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: 'none' }}
            />
            <button
                onClick={handleClick}
                className="btn btn-secondary"
            >
                <ImageIcon size={18} />
                Add Image
            </button>
        </>
    );
}
