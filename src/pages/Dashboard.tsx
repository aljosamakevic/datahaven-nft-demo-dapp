import { useState, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { SplitLayout } from '../components/SplitLayout';
import { dashboardSnippets } from '../config/codeSnippets';
import type { HealthStatus } from '../types';

export function Dashboard() {
  const {
    isWalletConnected,
    isMspConnected,
    isAuthenticated,
    address,
    mspInfo,
    userProfile,
    connectAndAuthenticate,
    getMspHealthStatus,
    disconnect,
    isLoading,
    error,
    clearError,
  } = useAppState();

  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState('connectFlow');

  // Auto-check health when MSP is connected
  useEffect(() => {
    if (isMspConnected && !healthStatus) {
      checkHealth();
    }
  }, [isMspConnected]);

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

  const truncateHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  const isFullyConnected = isWalletConnected && isMspConnected && isAuthenticated;

  return (
    <SplitLayout
      snippets={dashboardSnippets}
      defaultSnippetId="connectFlow"
      pageTitle="Dashboard"
      pageDescription="Connect your wallet, storage provider, and authenticate to get started."
      activeSnippetId={activeSnippet}
      onSnippetChange={setActiveSnippet}
    >
      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start justify-between">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          <button onClick={clearError} className="text-red-400 hover:text-red-300">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Disconnected State: Single connect card */}
      {!isFullyConnected && (
        <Card title="Connect & Authenticate">
          <div className="space-y-4">
            <p className="text-sm text-dh-300">
              One click connects your wallet, storage provider, and authenticates you via SIWE.
              You'll be prompted to approve two wallet signatures:
            </p>
            <ol className="text-sm text-dh-300 space-y-2 list-decimal list-inside">
              <li>
                <span className="text-dh-200 font-medium">Connect Wallet</span> — grants account access
                {isWalletConnected && (
                  <StatusBadge status="connected" className="ml-2 inline-flex" />
                )}
              </li>
              <li>
                <span className="text-dh-200 font-medium">Connect to Storage Provider</span> — establishes MSP connection
                {isMspConnected && (
                  <StatusBadge status="connected" className="ml-2 inline-flex" />
                )}
              </li>
              <li>
                <span className="text-dh-200 font-medium">Authenticate (SIWE)</span> — signs a message to prove identity
                {isAuthenticated && (
                  <StatusBadge status="connected" label="Authenticated" className="ml-2 inline-flex" />
                )}
              </li>
            </ol>

            {/* Show partial state if some steps succeeded */}
            {isWalletConnected && address && (
              <div className="bg-dh-900 rounded-lg p-3">
                <p className="text-xs text-dh-400 mb-1">Connected Address</p>
                <p className="text-sm font-mono text-dh-200 break-all">{address}</p>
              </div>
            )}

            <Button
              onClick={connectAndAuthenticate}
              isLoading={isLoading}
              className="w-full"
            >
              {isWalletConnected && !isMspConnected
                ? 'Continue Connection...'
                : isMspConnected && !isAuthenticated
                  ? 'Authenticate (SIWE)'
                  : 'Connect & Authenticate'}
            </Button>

            {isWalletConnected && (
              <Button onClick={disconnect} variant="secondary" className="w-full">
                Disconnect
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Connected State: Status summary */}
      {isFullyConnected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Wallet Status */}
            <Card title="Wallet">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dh-300">Status</span>
                  <StatusBadge status="connected" />
                </div>
                {address && (
                  <div className="bg-dh-900 rounded-lg p-3">
                    <p className="text-xs text-dh-400 mb-1">Address</p>
                    <p className="text-sm font-mono text-dh-200 break-all">{address}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* MSP Status */}
            <Card title="Storage Provider">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dh-300">Status</span>
                  <StatusBadge status="connected" />
                </div>
                {healthStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dh-300">Health</span>
                    <StatusBadge
                      status={healthStatus.status === 'healthy' ? 'healthy' : 'unhealthy'}
                      label={healthStatus.status}
                    />
                  </div>
                )}
                {mspInfo && (
                  <div className="bg-dh-900 rounded-lg p-3 space-y-2">
                    <div>
                      <p className="text-xs text-dh-400">MSP ID</p>
                      <p className="text-sm font-mono text-dh-200">{truncateHash(mspInfo.mspId)}</p>
                    </div>
                    {mspInfo.version && (
                      <div>
                        <p className="text-xs text-dh-400">Version</p>
                        <p className="text-sm text-dh-200">{mspInfo.version}</p>
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
            </Card>

            {/* Auth Status */}
            <Card title="Authentication">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dh-300">Status</span>
                  <StatusBadge status="connected" label="Authenticated" />
                </div>
                {userProfile && (
                  <div className="bg-dh-900 rounded-lg p-3">
                    <p className="text-xs text-dh-400 mb-1">User Address</p>
                    <p className="text-sm font-mono text-dh-200 break-all">{userProfile.address}</p>
                  </div>
                )}
                <p className="text-xs text-dh-400">
                  Signed in via SIWE (Sign-In With Ethereum).
                </p>
              </div>
            </Card>
          </div>

          <Button onClick={disconnect} variant="secondary" className="w-full">
            Disconnect
          </Button>

          {/* Next Steps */}
          <Card title="Next Steps">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a href="/mint" className="block p-4 bg-dh-900 rounded-lg hover:bg-dh-700 transition-colors">
                <h4 className="font-medium text-white mb-1">Mint an NFT</h4>
                <p className="text-sm text-dh-300">Upload an image to DataHaven and mint it as an NFT on-chain.</p>
              </a>
              <a href="/gallery" className="block p-4 bg-dh-900 rounded-lg hover:bg-dh-700 transition-colors">
                <h4 className="font-medium text-white mb-1">Browse Gallery</h4>
                <p className="text-sm text-dh-300">View all minted NFTs with images stored on DataHaven.</p>
              </a>
            </div>
          </Card>
        </>
      )}
    </SplitLayout>
  );
}
