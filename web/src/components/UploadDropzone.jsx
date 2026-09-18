import { useRef, useState } from 'react';
import { fileSize } from '../lib/format.js';

/**
 * Drag-and-drop (or tap-to-pick) photo input.
 * Holds File objects locally and previews them with object URLs; the actual
 * upload happens when the seller moves to the next step.
 */
export default function UploadDropzone({ files, onChange, maxFiles = 5, maxSizeMb = 10 }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState(null);

  const addFiles = (incoming) => {
    const accepted = [];
    let message = null;

    for (const file of Array.from(incoming)) {
      if (!file.type.startsWith('image/')) {
        message = `${file.name} bukan file gambar.`;
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        message = `${file.name} lebih dari ${maxSizeMb} MB.`;
        continue;
      }
      accepted.push(file);
    }

    const next = [...files, ...accepted].slice(0, maxFiles);
    if (files.length + accepted.length > maxFiles) {
      message = `Maksimal ${maxFiles} foto per pesanan.`;
    }
    setError(message);
    onChange(next);
  };

  const removeAt = (index) => {
    setError(null);
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div
        className={`dropzone${over ? ' is-over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <div className="dropzone__icon">[ + ]</div>
        <div style={{ fontWeight: 650 }}>Tarik foto ke sini atau ketuk untuk pilih</div>
        <div className="small muted">
          JPG, PNG, atau WEBP - maksimal {maxFiles} foto, {maxSizeMb} MB per foto
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>
          {error}
        </div>
      )}

      {files.length > 0 && (
        <>
          <div className="thumbs">
            {files.map((file, index) => (
              <div className="thumb" key={`${file.name}-${index}`}>
                <img src={URL.createObjectURL(file)} alt={file.name} />
                <button
                  type="button"
                  className="thumb__remove"
                  aria-label={`Hapus ${file.name}`}
                  onClick={() => removeAt(index)}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            {files.length} foto dipilih -{' '}
            {fileSize(files.reduce((sum, file) => sum + file.size, 0))} total
          </div>
        </>
      )}
    </div>
  );
}
