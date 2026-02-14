interface StatusBadgeProps {
  status: 'healthy' | 'unhealthy' | 'connected' | 'disconnected' | 'pending' | 'processing' | 'ready' | 'error';
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
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const dotColors: Record<string, string> = {
    healthy: 'bg-green-400',
    connected: 'bg-green-400',
    ready: 'bg-green-400',
    unhealthy: 'bg-red-400',
    disconnected: 'bg-red-400',
    error: 'bg-red-400',
    pending: 'bg-yellow-400',
    processing: 'bg-blue-400',
  };

  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColors[status]}`}
      />
      {displayLabel}
    </span>
  );
}
