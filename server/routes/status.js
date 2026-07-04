const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'status_uploads', resource_type: 'auto' },
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });
function formatStatus(row) {
  if (!row) return null;
  return {
    id: row.id ?? row.ID,
    user_id: row.user_id ?? row.USER_ID,
    media_url: row.media_url ?? row.MEDIA_URL,
    type: row.type ?? row.TYPE,
    created_at: row.created_at ?? row.CREATED_AT,
    username: row.username ?? row.USERNAME,
    display_name: row.display_name ?? row.DISPLAY_NAME,
    avatar_color: row.avatar_color ?? row.AVATAR_COLOR,
  };
}

router.post('/', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  const result = db.prepare(
    'INSERT INTO status (user_id, media_url, type) VALUES (?, ?, ?)'
  ).run(req.user.id, req.file.path, type);
  const status = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar_color
    FROM status s JOIN users u ON u.id = s.user_id WHERE s.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(formatStatus(status));
});

router.get('/', (req, res) => {
  const statuses = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar_color
    FROM status s
    JOIN users u ON u.id = s.user_id
    WHERE s.created_at >= datetime('now', '-1 day')
    ORDER BY s.created_at DESC
  `).all();
  res.json(statuses.map(formatStatus));
});
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = db.prepare('SELECT * FROM status WHERE id = ?').get(id);
  if (!status) return res.status(404).json({ error: 'Not found' });
  if ((status.user_id ?? status.USER_ID) !== req.user.id) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  db.prepare('DELETE FROM status WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;