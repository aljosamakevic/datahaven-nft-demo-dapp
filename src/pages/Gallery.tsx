import { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SplitLayout } from '../components/SplitLayout';
import { gallerySnippets } from '../config/codeSnippets';
import { fetchAllNFTs, burnNFT } from '../operations/nftOperations';
import type { MintedNFT } from '../types';

export function Gallery() {
  const { isAuthenticated, address, handleAuthError } = useAppState();

  const [nfts, setNfts] = useState<MintedNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMyOnly, setShowMyOnly] = useState(false);
  const [burningTokenId, setBurningTokenId] = useState<number | null>(null);
  const [activeSnippet, setActiveSnippet] = useState('fetchNfts');

  const loadNFTs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allNfts = await fetchAllNFTs();
      setNfts(allNfts);
    } catch (err) {
      if (handleAuthError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to load NFTs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (isAuthenticated) {
      loadNFTs();
    }
  }, [isAuthenticated, loadNFTs]);

  const handleBurn = async (tokenId: number) => {
    if (!confirm(`Are you sure you want to burn NFT #${tokenId}? This cannot be undone.`)) {
      return;
    }

    setBurningTokenId(tokenId);
    setActiveSnippet('burnNft');
    try {
      await burnNFT(tokenId);
      // Remove from list
      setNfts((prev) => prev.filter((nft) => nft.tokenId !== tokenId));
    } catch (err) {
      if (handleAuthError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to burn NFT';
      setError(message);
    } finally {
      setBurningTokenId(null);
    }
  };

  const filteredNfts = showMyOnly
    ? nfts.filter((nft) => nft.owner.toLowerCase() === address?.toLowerCase())
    : nfts;

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (!isAuthenticated) {
    return (
      <SplitLayout
        snippets={gallerySnippets}
        defaultSnippetId="fetchNfts"
        pageTitle="NFT Gallery"
        pageDescription="Browse all minted NFTs with images stored on DataHaven."
      >
        <Card>
          <div className="text-center py-8">
            <p className="text-dh-300 mb-4">Please connect your wallet and authenticate to view the gallery.</p>
            <a href="/" className="text-sage-400 hover:text-sage-300">Go to Dashboard</a>
          </div>
        </Card>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout
      snippets={gallerySnippets}
      defaultSnippetId="fetchNfts"
      pageTitle="NFT Gallery"
      pageDescription="Browse all minted NFTs with images stored on DataHaven."
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
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
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

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button onClick={loadNFTs} variant="secondary" size="sm" isLoading={loading}>
            Refresh
          </Button>
          <button
            onClick={() => setShowMyOnly(!showMyOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showMyOnly
                ? 'bg-sage-600 text-white'
                : 'bg-dh-700 text-dh-200 hover:bg-dh-600'
            }`}
          >
            {showMyOnly ? 'My NFTs' : 'All NFTs'}
          </button>
        </div>
        <p className="text-sm text-dh-400">
          {filteredNfts.length} NFT{filteredNfts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Loading */}
      {loading && nfts.length === 0 && (
        <Card>
          <div className="text-center py-8">
            <svg className="w-8 h-8 mx-auto text-sage-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-dh-300">Loading NFTs from chain and DataHaven...</p>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!loading && filteredNfts.length === 0 && (
        <Card>
          <div className="text-center py-8">
            <p className="text-dh-300 mb-4">
              {showMyOnly ? 'You haven\'t minted any NFTs yet.' : 'No NFTs have been minted yet.'}
            </p>
            <a href="/mint" className="text-sage-400 hover:text-sage-300">Mint your first NFT</a>
          </div>
        </Card>
      )}

      {/* NFT Grid */}
      {filteredNfts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNfts.map((nft) => {
            const isOwner = nft.owner.toLowerCase() === address?.toLowerCase();
            const isExpired = !nft.metadata || !nft.imageUrl;

            return (
              <div
                key={nft.tokenId}
                className="bg-dh-800 rounded-lg border border-dh-700 overflow-hidden"
              >
                {/* Image */}
                <div className="aspect-square bg-dh-900 flex items-center justify-center">
                  {nft.imageUrl ? (
                    <img
                      src={nft.imageUrl}
                      alt={nft.metadata?.name || `NFT #${nft.tokenId}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <svg className="w-12 h-12 mx-auto text-dh-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-sm text-dh-500">File Expired</p>
                      <p className="text-xs text-dh-600 mt-1">Storage payment may have lapsed</p>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white truncate">
                      {nft.metadata?.name || `NFT #${nft.tokenId}`}
                    </h3>
                    <span className="text-xs text-dh-400 flex-shrink-0 ml-2">#{nft.tokenId}</span>
                  </div>

                  {nft.metadata?.description && (
                    <p className="text-xs text-dh-300 line-clamp-2">{nft.metadata.description}</p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-dh-400">Owner</span>
                    <span className="text-xs font-mono text-dh-200">
                      {isOwner ? 'You' : truncateAddress(nft.owner)}
                    </span>
                  </div>

                  {isExpired && (
                    <div className="flex items-center space-x-1 pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span className="text-xs text-yellow-400">Metadata unavailable</span>
                    </div>
                  )}

                  {/* Owner Actions */}
                  {isOwner && (
                    <div className="flex space-x-2 pt-2">
                      <Button
                        onClick={() => handleBurn(nft.tokenId)}
                        variant="danger"
                        size="sm"
                        isLoading={burningTokenId === nft.tokenId}
                        className="flex-1"
                      >
                        Burn
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SplitLayout>
  );
}
