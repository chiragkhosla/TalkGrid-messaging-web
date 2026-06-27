export default function GroupAvatar({ name, size = 48 }) {
  const label = (name || 'Group').trim();
  const initial = label.charAt(0).toUpperCase() || 'G';
  return (
    <div
      className="group-avatar avatar--gradient"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #14b8a6 0%, #6366f1 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.4,
        color: '#fff',
        flexShrink: 0,
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
