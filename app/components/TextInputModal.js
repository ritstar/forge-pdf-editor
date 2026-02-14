import { useState } from 'react';
import { Type, X } from 'lucide-react';

export default function TextInputModal({ isOpen, onClose, onSubmit }) {
    const [text, setText] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim()) {
            onSubmit(text.trim());
            setText('');
            onClose();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            onKeyDown={handleKeyDown}
        >
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Type size={24} style={{ color: 'var(--primary)' }} />
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Add Text</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="modal-close-btn"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <label htmlFor="text-input" style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: 'var(--text-main)'
                        }}>
                            Enter your text:
                        </label>
                        <input
                            id="text-input"
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="e.g., Date: 2024-01-15"
                            autoFocus
                            className="modal-input"
                        />
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!text.trim()}
                            className="btn btn-primary"
                        >
                            Add Text
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
