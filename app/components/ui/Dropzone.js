'use client';

import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

// File picker that also accepts drag-and-drop and keyboard activation.
export default function Dropzone({
  accept,
  multiple = false,
  onFiles,
  title = 'Select a file',
  hint = 'or drop it here',
  buttonLabel,
  icon: Icon = UploadCloud,
  compact = false,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  const emit = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={`dropzone ${compact ? 'compact' : ''} ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        // Child elements fire their own enter/leave; only reset when leaving the zone itself.
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (!disabled) emit(event.dataTransfer.files);
      }}
    >
      <span className="dropzone-icon">
        <Icon size={compact ? 20 : 26} />
      </span>
      <span>
        <h3>{title}</h3>
        <p>{hint}</p>
      </span>
      <span className={`btn btn-primary ${compact ? '' : 'btn-lg'}`} aria-hidden="true">
        {buttonLabel || (multiple ? 'Choose files' : 'Choose file')}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(event) => {
          emit(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
