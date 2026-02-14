import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SplitLayout } from '../components/SplitLayout';
import { StatusBadge } from '../components/StatusBadge';
import { gallerySnippets } from '../config/codeSnippets';
import { fetchAllNFTs, burnNFT, updateTokenURI } from '../operations/nftOperations';
import {
  checkFileStatus,
  extractFileKeyFromUrl,
  deriveBucketIdForAddress,
  deleteNftFiles,
  ensureNftBucket,
  uploadFileToDH,
  waitForMSPConfirmOnChain,
  getDownloadUrl,
} from '../operations/storageOperations';
import { isWalletConnected } from '../services/clientService';
import type { MintedNFT, FileStatus } from '../types';

interface NftFileStatuses {
  metadata: FileStatus | null;
  image: FileStatus | null;
  error?: string;
}

export function Gallery() {
  const { isAuthenticated, address, handleAuthError } = useAppState();

  const [nfts, setNfts] = useState<MintedNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMyOnly, setShowMyOnly] = useState(false);
  const [burningTokenId, setBurningTokenId] = useState<number | null>(null);
  const [updatingTokenId, setUpdatingTokenId] = useState<number | null>(null);
  const [deletingTokenId, setDeletingTokenId] = useState<number | null>(null);
  const [activeSnippet, setActiveSnippet] = useState('fetchNfts');
  const [expandedTokenId, setExpandedTokenId] = useState<number | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<number, NftFileStatuses>>({});

  // Update Token URI inline form state
  const [editingTokenId, setEditingTokenId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState('');

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll file statuses when an NFT is expanded
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (expandedTokenId === null) return;

    const nft = nfts.find((n) => n.tokenId === expandedTokenId);
    if (!nft) return;

    const pollStatuses = async () => {
      // Skip polling if wallet/StorageHub client isn't ready yet
      if (!isWalletConnected()) return;

      try {
        const bucketId = await deriveBucketIdForAddress(nft.owner);

        // Check metadata file status
        const metadataFileKey = nft.tokenURI;
        const metadataStatus = await checkFileStatus(bucketId, metadataFileKey);

        // Check image file status (extract file key from the image URL in metadata)
        let imageStatus: FileStatus | null = null;
        if (nft.metadata?.image) {
          try {
            const imageFileKey = extractFileKeyFromUrl(nft.metadata.image);
            imageStatus = await checkFileStatus(bucketId, imageFileKey);
          } catch {
            imageStatus = null;
          }
        }

        setFileStatuses((prev) => ({
          ...prev,
          [expandedTokenId]: { metadata: metadataStatus, image: imageStatus },
        }));
      } catch (err) {
        console.warn('Failed to poll file statuses:', err);
        setFileStatuses((prev) => ({
          ...prev,
          [expandedTokenId]: {
            metadata: null,
            image: null,
            error: err instanceof Error ? err.message : 'Failed to fetch file statuses',
          },
        }));
      }
    };

    // Poll immediately, then every 10 seconds
    pollStatuses();
    pollIntervalRef.current = setInterval(pollStatuses, 10000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [expandedTokenId, nfts]);

  const handleBurn = async (nft: MintedNFT) => {
    if (
      !confirm(
        `Are you sure you want to burn NFT #${nft.tokenId}? This will also delete files from DataHaven. This cannot be undone.`
      )
    ) {
      return;
    }

    setBurningTokenId(nft.tokenId);
    setActiveSnippet('burnNft');
    try {
      const imageFileKey = nft.metadata?.image ? extractFileKeyFromUrl(nft.metadata.image) : null;
      await burnNFT(nft.tokenId, nft.owner, nft.tokenURI, imageFileKey);
      setNfts((prev) => prev.filter((n) => n.tokenId !== nft.tokenId));
      if (expandedTokenId === nft.tokenId) {
        setExpandedTokenId(null);
      }
    } catch (err) {
      if (handleAuthError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to burn NFT';
      setError(message);
    } finally {
      setBurningTokenId(null);
    }
  };

  const handleDeleteFiles = async (nft: MintedNFT) => {
    if (!confirm(`Delete DataHaven files for NFT #${nft.tokenId}? The NFT token will remain on-chain.`)) return;

    setDeletingTokenId(nft.tokenId);
    setActiveSnippet('deleteFiles');
    try {
      const imageFileKey = nft.metadata?.image ? extractFileKeyFromUrl(nft.metadata.image) : null;
      await deleteNftFiles(nft.owner, nft.tokenURI, imageFileKey);
      // Clear cached file statuses so they re-poll
      setFileStatuses((prev) => {
        const copy = { ...prev };
        delete copy[nft.tokenId];
        return copy;
      });
      // Reload NFTs to reflect deleted state (metadata/image will be null)
      await loadNFTs();
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Failed to delete files');
    } finally {
      setDeletingTokenId(null);
    }
  };

  const startEditing = (nft: MintedNFT) => {
    setEditingTokenId(nft.tokenId);
    setEditName(nft.metadata?.name || '');
    setEditDescription(nft.metadata?.description || '');
    setEditFile(null);
    setEditPreview(null);
    setUpdateProgress('');
    setActiveSnippet('updateNftFiles');
  };

  const cancelEditing = () => {
    setEditingTokenId(null);
    setEditName('');
    setEditDescription('');
    setEditFile(null);
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditPreview(null);
    setUpdateProgress('');
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setEditFile(file);
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleUpdateSubmit = async (nft: MintedNFT) => {
    if (!editFile) {
      setError('Please select an image file');
      return;
    }
    if (!editName.trim()) {
      setError('Please enter a name');
      return;
    }
    if (!address) return;

    setUpdatingTokenId(nft.tokenId);
    setActiveSnippet('updateNftFiles');
    try {
      // 1. Ensure bucket
      setUpdateProgress('Ensuring bucket...');
      const bucketId = await ensureNftBucket(address);

      // 2. Upload new image
      setUpdateProgress('Uploading image...');
      const imageBytes = new Uint8Array(await editFile.arrayBuffer());
      const imageName = `nft-${nft.tokenId}-image-${Date.now()}.${editFile.name.split('.').pop()}`;
      const imageFileKey = await uploadFileToDH(bucketId, imageName, imageBytes, imageBytes.length);

      // 3. Wait for image confirmation
      setUpdateProgress('Waiting for image confirmation...');
      await waitForMSPConfirmOnChain(imageFileKey);

      // 4. Build and upload new metadata
      setUpdateProgress('Uploading metadata...');
      const metadata = {
        name: editName.trim(),
        description: editDescription.trim(),
        image: getDownloadUrl(imageFileKey),
      };
      const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
      const metadataName = `nft-${nft.tokenId}-metadata-${Date.now()}.json`;
      const metadataFileKey = await uploadFileToDH(bucketId, metadataName, metadataBytes, metadataBytes.length);

      // 5. Wait for metadata confirmation
      setUpdateProgress('Waiting for metadata confirmation...');
      await waitForMSPConfirmOnChain(metadataFileKey);

      // 6. Update token URI on-chain
      setUpdateProgress('Updating token URI on-chain...');
      await updateTokenURI(nft.tokenId, metadataFileKey);

      // 7. Done — reload
      setUpdateProgress('');
      cancelEditing();
      await loadNFTs();
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Failed to update NFT');
      setUpdateProgress('');
    } finally {
      setUpdatingTokenId(null);
    }
  };

  const toggleExpand = (tokenId: number) => {
    setExpandedTokenId((prev) => (prev === tokenId ? null : tokenId));
  };

  const filteredNfts = showMyOnly ? nfts.filter((nft) => nft.owner.toLowerCase() === address?.toLowerCase()) : nfts;

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const truncateFileKey = (key: string) => `${key.slice(0, 10)}...${key.slice(-8)}`;

  // NFT-level alive/dead status: alive if both metadata and image are available
  const isNftAlive = (nft: MintedNFT) => nft.metadata !== null && nft.imageUrl !== null;

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
            <a href="/" className="text-sage-400 hover:text-sage-300">
              Go to Dashboard
            </a>
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
              showMyOnly ? 'bg-sage-600 text-white' : 'bg-dh-700 text-dh-200 hover:bg-dh-600'
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
              {showMyOnly ? "You haven't minted any NFTs yet." : 'No NFTs have been minted yet.'}
            </p>
            <a href="/mint" className="text-sage-400 hover:text-sage-300">
              Mint your first NFT
            </a>
          </div>
        </Card>
      )}

      {/* NFT Grid */}
      {filteredNfts.length > 0 && (
        <div className="grid nft-grid gap-6">
          {filteredNfts.map((nft) => {
            const isOwner = nft.owner.toLowerCase() === address?.toLowerCase();
            const alive = isNftAlive(nft);
            const isExpanded = expandedTokenId === nft.tokenId;
            const statuses = fileStatuses[nft.tokenId];

            return (
              <div key={nft.tokenId} className="bg-dh-800 rounded-lg border border-dh-700 overflow-hidden">
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
                      <svg
                        className="w-12 h-12 mx-auto text-dh-600 mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                      <p className="text-sm text-dh-500">File Expired</p>
                      <p className="text-xs text-dh-600 mt-1">Storage payment may have lapsed</p>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 space-y-2">
                  {/* Header: Name + Token ID + Alive/Dead tag */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white truncate">
                      {nft.metadata?.name || `NFT #${nft.tokenId}`}
                    </h3>
                    <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          alive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {alive ? 'Alive' : 'Dead'}
                      </span>
                      <span className="text-xs text-dh-400">#{nft.tokenId}</span>
                    </div>
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

                  {/* Expand/Collapse toggle */}
                  <button
                    onClick={() => toggleExpand(nft.tokenId)}
                    className="w-full flex items-center justify-center pt-2 text-xs text-dh-400 hover:text-dh-200 transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                    {isExpanded ? 'Hide Details' : 'Show Details'}
                  </button>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="pt-3 space-y-4 border-t border-dh-700">
                      {/* File Status Section */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-dh-300 uppercase tracking-wider">
                          DataHaven File Status
                        </h4>
                        {statuses?.error ? (
                          <p className="text-xs text-red-400">{statuses.error}</p>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-dh-400">Metadata File Key</span>
                                <p className="text-xs font-mono text-dh-200 truncate" title={nft.tokenURI}>
                                  {truncateFileKey(nft.tokenURI)}
                                </p>
                              </div>
                              <div className="flex-shrink-0 ml-2">
                                {statuses ? (
                                  statuses.metadata !== null ? (
                                    <StatusBadge status={statuses.metadata} />
                                  ) : (
                                    <span className="text-xs text-dh-500">Not Found</span>
                                  )
                                ) : (
                                  <span className="text-xs text-dh-500">Loading...</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-dh-400">Image File Key</span>
                                <p
                                  className="text-xs font-mono text-dh-200 truncate"
                                  title={nft.metadata?.image || 'N/A'}
                                >
                                  {nft.metadata?.image
                                    ? truncateFileKey(extractFileKeyFromUrl(nft.metadata.image))
                                    : 'N/A'}
                                </p>
                              </div>
                              <div className="flex-shrink-0 ml-2">
                                {statuses ? (
                                  statuses.image !== null ? (
                                    <StatusBadge status={statuses.image} />
                                  ) : (
                                    <span className="text-xs text-dh-500">Not Found</span>
                                  )
                                ) : (
                                  <span className="text-xs text-dh-500">Loading...</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Metadata JSON Section */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-dh-300 uppercase tracking-wider">Metadata JSON</h4>
                        {nft.metadata ? (
                          <pre className="bg-dh-900 rounded-lg p-3 text-xs text-dh-200 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(nft.metadata, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-xs text-dh-500 italic">Metadata unavailable — file may have expired</p>
                        )}
                      </div>

                      {/* Owner Actions */}
                      {isOwner &&
                        (editingTokenId === nft.tokenId ? (
                          <div className="space-y-3">
                            <h4 className="text-xs font-medium text-dh-300 uppercase tracking-wider">Update NFT</h4>
                            <div>
                              <label className="block text-xs text-dh-400 mb-1">Name</label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full bg-dh-900 border border-dh-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sage-500"
                                placeholder="NFT Name"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-dh-400 mb-1">Description</label>
                              <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                rows={2}
                                className="w-full bg-dh-900 border border-dh-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sage-500 resize-none"
                                placeholder="Description"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-dh-400 mb-1">New Image</label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleEditFileChange}
                                className="w-full text-xs text-dh-300 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-dh-700 file:text-dh-200 hover:file:bg-dh-600"
                              />
                              {editPreview && (
                                <img
                                  src={editPreview}
                                  alt="Preview"
                                  className="mt-2 w-full h-32 object-cover rounded-lg"
                                />
                              )}
                            </div>
                            {updateProgress && <p className="text-xs text-sage-400">{updateProgress}</p>}
                            <div className="flex space-x-2">
                              <Button
                                onClick={cancelEditing}
                                variant="secondary"
                                size="sm"
                                className="flex-1"
                                disabled={updatingTokenId === nft.tokenId}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => handleUpdateSubmit(nft)}
                                variant="primary"
                                size="sm"
                                isLoading={updatingTokenId === nft.tokenId}
                                className="flex-1"
                              >
                                Upload & Update
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <h4 className="text-xs font-medium text-dh-300 uppercase tracking-wider">Actions</h4>
                            <div className="flex flex-col space-y-2">
                              <Button
                                onClick={() => startEditing(nft)}
                                variant="secondary"
                                size="sm"
                                className="flex-1"
                              >
                                Update NFT Files
                              </Button>
                              <Button
                                onClick={() => handleDeleteFiles(nft)}
                                variant="secondary"
                                size="sm"
                                isLoading={deletingTokenId === nft.tokenId}
                                disabled={
                                  !!statuses &&
                                  !statuses.error &&
                                  (statuses.metadata === null || statuses.metadata === 'deletionInProgress') &&
                                  (statuses.image === null || statuses.image === 'deletionInProgress')
                                }
                                className="flex-1"
                              >
                                Delete NFT Files
                              </Button>
                              <Button
                                onClick={() => handleBurn(nft)}
                                variant="danger"
                                size="sm"
                                isLoading={burningTokenId === nft.tokenId}
                                className="flex-1"
                              >
                                Burn NFT
                              </Button>
                            </div>
                          </div>
                        ))}
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
