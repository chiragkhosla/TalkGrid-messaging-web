const db = require('./db');

function rowId(row) {
  if (!row) return null;
  const v = row.id !== undefined ? row.id : row.ID;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') return parseInt(v, 10);
  return null;
}

function formatUser(row) {
  if (!row) return null;
  return {
    id: rowId(row),
    username: row.username ?? row.USERNAME ?? '',
    display_name: row.display_name ?? row.DISPLAY_NAME ?? null,
    avatar_color: row.avatar_color ?? row.AVATAR_COLOR ?? null,
  };
}

function getMemberIds(conversationId) {
  return db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?')
    .all(conversationId)
    .map((r) => Number(r.user_id ?? r.USER_ID))
    .filter((id) => !Number.isNaN(id) && id > 0);
}

function emitToConversationMembers(io, conversationId, event, payload) {
  if (!io) return;
  for (const id of getMemberIds(conversationId)) {
    io.to(`user:${String(id)}`).emit(event, payload);
  }
}

function isGroupConversation(conversationId) {
  const row = db.prepare('SELECT is_group FROM conversations WHERE id = ?').get(conversationId);
  if (!row) return false;
  const flag = row.is_group ?? row.IS_GROUP;
  return Number(flag) === 1;
}

module.exports = {
  rowId,
  formatUser,
  getMemberIds,
  emitToConversationMembers,
  isGroupConversation,
};
