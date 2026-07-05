import { useState, useEffect } from 'react';
import * as api from './api';
import Avatar from './Avatar';

export default function StatusPage({ statuses, onClose, currentUserId, setStatuses, setSelectedStatuses }) {
  const [index, setIndex] = useState(0);
  const current = statuses[index];

  useEffect(() => {
    if (!statuses.length) onClose();
  }, [statuses, onClose]);

  if (!statuses.length) return null;

  const handleDelete = async () => {
    try {
      await api.deleteStatus(current.id);
      setStatuses(prev => prev.filter(s => s.id !== current.id));
      setSelectedStatuses(prev => {
        const updated = prev.filter(s => s.id !== current.id);
        if (updated.length === 0) {
          onClose();
        } else if (index >= updated.length) {
          setIndex(updated.length - 1);
        }
        return updated;
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="status-page" key={current.id}>
      <div className="status-header">
        <div className="status-user">
          <Avatar user={current} size={40} />
          <span>{current.display_name || current.username}</span>
        </div>
        <div className="status-actions">
          {current.user_id === currentUserId && (
            <button className="delete-btn" onClick={handleDelete}>Delete</button>
          )}
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="status-content">
        {current.type === 'image' ? (
          <img src={current.media_url} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain' }} />
        ) : (
          <video src={current.media_url} controls autoPlay muted style={{ width: '100%', height: '90vh', objectFit: 'contain' }} />
        )}
      </div>

      {index > 0 && (
        <div className="arrow left" onClick={() => setIndex(i => i - 1)}>❮</div>
      )}
      {index < statuses.length - 1 && (
        <div className="arrow right" onClick={() => setIndex(i => i + 1)}>❯</div>
      )}
    </div>
  );
}