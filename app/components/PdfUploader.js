import { UploadCloud } from 'lucide-react';

export default function PdfUploader({ onUpload }) {
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            onUpload(file);
        }
    };

    return (
        <div className="upload-container">
            <label htmlFor="pdf-upload" style={{ cursor: 'pointer', display: 'block' }}>
                <UploadCloud size={64} className="upload-icon" style={{ margin: '0 auto' }} />
                <div className="upload-text">
                    Click to upload PDF
                </div>
                <div className="upload-subtext">
                    or drag and drop your file here
                </div>
            </label>
            <input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />
        </div>
    );
}
