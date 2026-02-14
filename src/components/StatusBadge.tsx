interface StatusBadgeProps {
  status: 'healthy' | 'unhealthy' | 'connected' | 'disconnected'
    | 'inProgress' | 'ready' | 'expired' | 'revoked' | 'rejected' | 'deletionInProgress';
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
    connected: 'bg-green-500/20 text-green-400 border-green-500/30',
    ready: 'bg-green-500/20 text-green-400 border-green-500/30',
    unhealthy: 'bg-red-500/20 text-red-400 border-red-500/30',
    disconnected: 'bg-red-500/20 text-red-400 border-red-500/30',
    expired: 'bg-red-500/20 text-red-400 border-red-500/30',
    revoked: 'bg-red-500/20 text-red-400 border-red-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    inProgress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    deletionInProgress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  const dotColors: Record<string, string> = {
    healthy: 'bg-green-400',
    connected: 'bg-green-400',
    ready: 'bg-green-400',
    unhealthy: 'bg-red-400',
    disconnected: 'bg-red-400',
    expired: 'bg-red-400',
    revoked: 'bg-red-400',
    rejected: 'bg-red-400',
    inProgress: 'bg-blue-400',
    deletionInProgress: 'bg-yellow-400',
  };

  const displayLabels: Record<string, string> = {
    inProgress: 'In Progress',
    deletionInProgress: 'Deleting',
  };

  const displayLabel = label || displayLabels[status] || status.charAt(0).toUpperCase() + status.slice(1);

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
