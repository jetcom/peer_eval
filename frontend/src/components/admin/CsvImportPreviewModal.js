import React from 'react';

// Shown after a CSV is selected but before it's committed — lets the
// teacher/admin see what an upload will do (and any row errors) before
// anything is written to the database.
function CsvImportPreviewModal({ darkMode, preview, fileName, uploading, onConfirm, onCancel }) {
  if (!preview) return null;

  const allFailed = preview.errors?.length > 0 && preview.created === 0 && preview.enrolled === 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: darkMode ? '#1a1a1a' : '#fff',
        padding: '30px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '85vh',
        overflow: 'auto',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Review Import</h2>
        <p style={{ marginTop: 0, marginBottom: '15px', color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.9rem' }}>
          {fileName}
        </p>

        {allFailed ? (
          <p style={{ color: '#e74c3c' }}>Nothing in this file could be imported — see the errors below.</p>
        ) : (
          <ul style={{ paddingLeft: '20px', lineHeight: '1.7', margin: '0 0 15px 0' }}>
            <li>{preview.created} new student{preview.created !== 1 ? 's' : ''} will be created</li>
            <li>{preview.enrolled} student{preview.enrolled !== 1 ? 's' : ''} will be enrolled in this class</li>
            {preview.names_updated > 0 && (
              <li>{preview.names_updated} existing name{preview.names_updated !== 1 ? 's' : ''} will be updated</li>
            )}
            {preview.group_changes > 0 && (
              <li>{preview.group_changes} group reassignment{preview.group_changes !== 1 ? 's' : ''}</li>
            )}
            {preview.new_groups > 0 && (
              <li>{preview.new_groups} new group{preview.new_groups !== 1 ? 's' : ''} will be created</li>
            )}
          </ul>
        )}

        {preview.errors?.length > 0 && (
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: '#e74c3c' }}>
              {preview.errors.length} row{preview.errors.length !== 1 ? 's' : ''} with errors (will be skipped):
            </strong>
            <div style={{
              maxHeight: '180px',
              overflow: 'auto',
              marginTop: '8px',
              background: darkMode ? '#2a1515' : '#fdecea',
              color: darkMode ? '#f5b7b1' : '#611a15',
              padding: '10px',
              borderRadius: '6px',
              fontSize: '0.85rem'
            }}>
              {preview.errors.map((e, idx) => (
                <div key={idx} style={{ marginBottom: '4px' }}>
                  <strong>{e.email || 'unknown'}:</strong> {e.error}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={uploading || allFailed}
          >
            {uploading ? 'Importing...' : 'Confirm Import'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={uploading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default CsvImportPreviewModal;
