interface StatusBadgeProps {
  status: 'healthy' | 'unhealthy' | 'connected' | 'disconnected' | 'pending' | 'ready' | 'error';
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
    connected: 'bg-green-500/20 text-green-400 border-green-500/30',
    ready: 'bg-green-500/20 text-green-400 border-green-500/30',
    unhealthy: 'bg-red-500/20 text-red-400 border-red-500/30',
    disconnected: 'bg-red-500/20 text-red-400 border-red-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          status === 'healthy' || status === 'connected' || status === 'ready'
            ? 'bg-green-400'
            : status === 'pending'
            ? 'bg-yellow-400'
            : 'bg-red-400'
        }`}
      />
      {displayLabel}
    </span>
  );
}
