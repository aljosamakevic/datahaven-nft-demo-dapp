import { useState, useEffect, useRef } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import type { HealthStatus } from '../types';

interface WalletDropdownProps {
  mobile?: boolean;
}

export function WalletDropdown({ mobile = false }: WalletDropdownProps) {
  const {
    isWalletConnected,
    isMspConnected,
    isAuthenticated,
    address,
    mspInfo,
    userProfile,
    connectAndAuthenticate,
    disconnect,
    getMspHealthStatus,
    isLoading,
    error,
    clearError,
  } = useAppState();

  const [isOpen, setIsOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside-to-close (desktop only)
  useEffect(() => {
    if (mobile) return;

    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobile]);

  // Auto-health-check when dropdown opens and MSP is connected
  useEffect(() => {
    if (isOpen && isMspConnected && !healthStatus) {
      checkHealth();
    }
  }, [isOpen, isMspConnected]);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const status = await getMspHealthStatus();
      setHealthStatus(status);
    } catch {
      // Error is handled by context
    } finally {
      setHealthLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setIsOpen(false);
    setHealthStatus(null);
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const truncateHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  const isFullyConnected = isWalletConnected && isMspConnected && isAuthenticated;

  // --- Disconnected state ---
  if (!isWalletConnected) {
    return (
      <div className={mobile ? 'px-3 py-2' : 'ml-4'}>
        <Button
          onClick={connectAndAuthenticate}
          isLoading={isLoading}
          size="sm"
        >
          Connect
        </Button>
        {error && (
          <p className="text-xs text-red-400 mt-1 max-w-[200px]">{error}</p>
        )}
      </div>
    );
  }

  // --- Partially connected (wallet yes, but MSP or auth not done) ---
  if (!isFullyConnected) {
    return (
      <div className={mobile ? 'px-3 py-2 space-y-2' : 'ml-4 flex items-center space-x-2'}>
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-sm text-dh-200 font-mono">{truncateAddress(address!)}</span>
        </div>
        <Button
          onClick={connectAndAuthenticate}
          isLoading={isLoading}
          size="sm"
        >
          Continue
        </Button>
        {error && (
          <p className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </div>
    );
  }

  // --- Fully connected state ---
  const dropdownPanel = (
    <div className={
      mobile
        ? 'mt-2 w-full bg-dh-900 border border-dh-700 rounded-lg p-4 space-y-4'
        : 'absolute right-0 top-full mt-2 w-80 z-50 bg-dh-800 border border-dh-700 rounded-lg shadow-lg p-4 space-y-4'
    }>
      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start justify-between">
          <span className="text-red-400 text-xs flex-1">{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-300 ml-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Wallet */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-dh-300 uppercase tracking-wider">Wallet</span>
          <StatusBadge status="connected" />
        </div>
        {address && (
          <p className="text-xs font-mono text-dh-200 break-all bg-dh-900 rounded-lg p-2">{address}</p>
        )}
      </div>

      {/* Storage Provider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-dh-300 uppercase tracking-wider">Storage Provider</span>
          <StatusBadge status="connected" />
        </div>
        {healthStatus && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-dh-400">Health</span>
            <StatusBadge
              status={healthStatus.status === 'healthy' ? 'healthy' : 'unhealthy'}
              label={healthStatus.status}
            />
          </div>
        )}
        {mspInfo && (
          <div className="bg-dh-900 rounded-lg p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dh-400">MSP ID</span>
              <span className="text-xs font-mono text-dh-200">{truncateHash(mspInfo.mspId)}</span>
            </div>
            {mspInfo.version && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-dh-400">Version</span>
                <span className="text-xs text-dh-200">{mspInfo.version}</span>
              </div>
            )}
          </div>
        )}
        <Button
          onClick={checkHealth}
          variant="secondary"
          size="sm"
          isLoading={healthLoading}
          className="w-full"
        >
          Check Health
        </Button>
      </div>

      {/* Authentication */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-dh-300 uppercase tracking-wider">Authentication</span>
          <StatusBadge status="connected" label="Authenticated" />
        </div>
        {userProfile && (
          <p className="text-xs text-dh-400">
            Signed in via SIWE
          </p>
        )}
      </div>

      {/* Disconnect */}
      <Button
        onClick={handleDisconnect}
        variant="secondary"
        size="sm"
        className="w-full"
      >
        Disconnect
      </Button>
    </div>
  );

  // Mobile: inline expand/collapse
  if (mobile) {
    return (
      <div className="px-3 py-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 w-full"
        >
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm text-dh-200 font-mono">{truncateAddress(address!)}</span>
          <svg
            className={`w-4 h-4 text-dh-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && dropdownPanel}
      </div>
    );
  }

  // Desktop: absolute dropdown
  return (
    <div className="relative ml-4" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-dh-700 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-sm text-dh-200 font-mono">{truncateAddress(address!)}</span>
        <svg
          className={`w-4 h-4 text-dh-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && dropdownPanel}
    </div>
  );
}
