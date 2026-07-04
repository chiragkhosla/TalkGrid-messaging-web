import { useState, useRef } from 'react';
import * as api from './api';
import Avatar from './Avatar';

export default function StatusBar({ statuses, currentUser, onRefresh, onOpen }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const grouped = statuses.reduce((acc, s) => {
    const uid = s.user_id ?? s.USER_ID;
    if (!acc[uid]) acc[uid] = [];
    acc[uid].push(s);
    return acc;
  }, {});

  const myStatuses = grouped[currentUser.id] || [];
  const otherUserIds = Object.keys(grouped).filter((id) => Number(id) !== currentUser.id);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadStatus(file);
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="status-bar">
      <input
        type="file"
        accept="image/*,video/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="status-bar-item status-bar-add"
        onClick={() => (myStatuses.length ? onOpen(myStatuses) : fileInputRef.current?.click())}
        disabled={uploading}
      >
        <div className={`status-avatar-ring ${myStatuses.length ? 'status-avatar-ring--mine' : ''}`}>
          <Avatar user={currentUser} size={52} />
          <span
            className="status-add-badge"
            onClick={(e) => {
              e.stopPropagation();
              if (!uploading) fileInputRef.current?.click();
            }}
            role="button"
            aria-label="Add status"
          >
            +
          </span>
        </div>
        <span className="status-bar-label">{uploading ? 'Uploading…' : 'My status'}</span>
      </button>

      {otherUserIds.map((uid) => {
        const userStatuses = grouped[uid];
        const first = userStatuses[0];
        return (
          <button
            key={uid}
            type="button"
            className="status-bar-item"
            onClick={() => onOpen(userStatuses)}
          >
            <div className="status-avatar-ring status-avatar-ring--unseen">
              <Avatar user={first} size={52} />
            </div>
            <span className="status-bar-label">{first.display_name || first.username}</span>
          </button>
        );
      })}
    </div>
  );
}