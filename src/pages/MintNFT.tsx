import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressStepper } from '../components/ProgressStepper';
import { SplitLayout } from '../components/SplitLayout';
import { mintSnippets } from '../config/codeSnippets';
import {
  ensureNftBucket,
  uploadFileToDH,
  waitForMSPConfirmOnChain,
  getDownloadUrl,
  checkFileStatus,
  deriveBucketIdForAddress,
  getNftBucketName,
} from '../operations/storageOperations';
import { mintNFT } from '../operations/nftOperations';
import { getMspInfo } from '../services/mspService';
import { getPolkadotApi } from '../services/clientService';
import type { MintProgress, FileConfirmation } from '../types';

export function MintNFT() {
  const { isAuthenticated, address, handleAuthError, connectAndAuthenticate, isLoading } = useAppState();

  const [nftName, setNftName] = useState('');
  const [nftDescription, setNftDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [activeSnippet, setActiveSnippet] = useState('ensureBucket');

  // Bucket state
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [bucketExists, setBucketExists] = useState<boolean | null>(null); // null = not checked yet
  const [bucketLoading, setBucketLoading] = useState(false);
  const [bucketCreating, setBucketCreating] = useState(false);
  const [mspId, setMspId] = useState<string | null>(null);

  const [progress, setProgress] = useState<MintProgress>({ step: 'idle', message: '' });
  const [mintResult, setMintResult] = useState<{ tokenId: number; txHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Post-mint file status tracking
  const [fileConfirmations, setFileConfirmations] = useState<FileConfirmation[]>([]);
  const [mintBucketId, setMintBucketId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const bucketName = address ? getNftBucketName(address) : null;

  // Check bucket existence on mount when authenticated
  useEffect(() => {
    if (isAuthenticated && address) {
      checkBucketExists();
    }
  }, [isAuthenticated, address]);

  const checkBucketExists = async () => {
    if (!address) return;
    setBucketLoading(true);
    try {
      const id = await deriveBucketIdForAddress(address);
      setBucketId(id);

      // Check on-chain if bucket exists
      const polkadotApi = getPolkadotApi();
      const bucketOnChain = await polkadotApi.query.providers.buckets(id);
      setBucketExists(!bucketOnChain.isEmpty);

      // Fetch MSP ID for display
      try {
        const info = await getMspInfo();
        setMspId(info.mspId);
      } catch {
        // Non-critical — just for display
      }
    } catch (err) {
      if (handleAuthError(err)) return;
      console.warn('Failed to check bucket:', err);
      setBucketExists(false);
    } finally {
      setBucketLoading(false);
    }
  };

  const handleCreateBucket = async () => {
    if (!address) return;
    setBucketCreating(true);
    setError(null);
    try {
      setActiveSnippet('ensureBucket');
      const id = await ensureNftBucket(address);
      setBucketId(id);
      setBucketExists(true);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Failed to create bucket');
    } finally {
      setBucketCreating(false);
    }
  };

  const truncateHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMint = async () => {
    if (!selectedFile || !nftName || !address) return;

    setError(null);
    setMintResult(null);
    setFileConfirmations([]);

    try {
      // Step 1: Ensure bucket
      setProgress({ step: 'ensuring-bucket', message: 'Creating storage bucket if needed...' });
      setActiveSnippet('ensureBucket');
      const mintBucket = await ensureNftBucket(address);
      setMintBucketId(mintBucket);
      setBucketId(mintBucket);
      setBucketExists(true);

      // Step 2: Upload image + wait for MSP on-chain confirm
      setProgress({ step: 'uploading-image', message: 'Uploading image to DataHaven...' });
      setActiveSnippet('uploadImage');
      const fileBuffer = await selectedFile.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      const imageFileKey = await uploadFileToDH(
        mintBucket,
        `image-${Date.now()}-${selectedFile.name}`,
        fileBytes,
        selectedFile.size
      );
      setProgress({ step: 'uploading-image', message: 'Waiting for MSP on-chain confirmation...' });
      await waitForMSPConfirmOnChain(imageFileKey);

      // Step 3: Upload metadata + wait for MSP on-chain confirm
      setProgress({ step: 'uploading-metadata', message: 'Uploading NFT metadata to DataHaven...' });
      setActiveSnippet('uploadMetadata');
      const metadata = {
        name: nftName,
        description: nftDescription,
        image: getDownloadUrl(imageFileKey),
      };
      const metadataJson = JSON.stringify(metadata, null, 2);
      const encoder = new TextEncoder();
      const metadataBytes = encoder.encode(metadataJson);
      const metadataFileKey = await uploadFileToDH(
        mintBucket,
        `metadata-${Date.now()}.json`,
        metadataBytes,
        metadataBytes.length
      );
      setProgress({ step: 'uploading-metadata', message: 'Waiting for MSP on-chain confirmation...' });
      await waitForMSPConfirmOnChain(metadataFileKey);

      // Step 4: Mint NFT on-chain
      setProgress({ step: 'minting', message: 'Minting NFT on-chain...' });
      setActiveSnippet('mintNft');
      const result = await mintNFT(metadataFileKey);

      setMintResult(result);
      setProgress({ step: 'done', message: `NFT #${result.tokenId} minted successfully!` });

      // Start background file status tracking
      setFileConfirmations([
        { label: 'Image', fileKey: imageFileKey, status: null },
        { label: 'Metadata', fileKey: metadataFileKey, status: null },
      ]);
    } catch (err) {
      if (handleAuthError(err)) return;
      const message = err instanceof Error ? err.message : 'Minting failed';
      setError(message);
      setProgress({ step: 'error', message });
    }
  };

  // Terminal file statuses — no point polling further once reached
  const terminalStatuses = ['ready', 'expired', 'revoked', 'rejected'] as const;
  const isTerminal = (status: string | null) =>
    status !== null && terminalStatuses.includes(status as (typeof terminalStatuses)[number]);

  // Background polling for file confirmation status
  const pollFileStatuses = useCallback(async () => {
    if (!mintBucketId || fileConfirmations.length === 0) return;

    const updated = await Promise.all(
      fileConfirmations.map(async (fc) => {
        if (isTerminal(fc.status)) return fc;
        try {
          const status = await checkFileStatus(mintBucketId, fc.fileKey);
          return { ...fc, status };
        } catch {
          return fc; // keep current status on unexpected error
        }
      })
    );

    setFileConfirmations(updated);

    // Stop polling when all files have terminal statuses
    if (updated.every((fc) => isTerminal(fc.status))) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [mintBucketId, fileConfirmations]);

  // Start polling when file confirmations are set
  useEffect(() => {
    if (progress.step === 'done' && fileConfirmations.length > 0 && !pollingRef.current) {
      // Immediate first check
      pollFileStatuses();
      pollingRef.current = setInterval(pollFileStatuses, 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [progress.step, fileConfirmations.length, pollFileStatuses]);

  const resetForm = () => {
    setNftName('');
    setNftDescription('');
    clearSelection();
    setProgress({ step: 'idle', message: '' });
    setMintResult(null);
    setError(null);
    setFileConfirmations([]);
    setMintBucketId(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const getSteps = () => {
    const steps: { label: string; status: 'pending' | 'active' | 'completed' | 'error' }[] = [
      { label: 'Ensure storage bucket', status: 'pending' },
      { label: 'Upload image to DataHaven', status: 'pending' },
      { label: 'Upload metadata to DataHaven', status: 'pending' },
      { label: 'Mint NFT on-chain', status: 'pending' },
    ];

    const stepMap: Record<string, number> = {
      'ensuring-bucket': 0,
      'uploading-image': 1,
      'uploading-metadata': 2,
      minting: 3,
    };

    if (progress.step === 'idle') return steps;
    if (progress.step === 'done') {
      return steps.map((s) => ({ ...s, status: 'completed' as const }));
    }
    if (progress.step === 'error') {
      const currentIndex =
        stepMap[
          Object.keys(stepMap)
            .reverse()
            .find((key) => stepMap[key] !== undefined) || ''
        ];
      if (currentIndex !== undefined) {
        for (let i = 0; i < currentIndex; i++) {
          steps[i].status = 'completed';
        }
        steps[currentIndex].status = 'error';
      }
      return steps;
    }

    const currentIndex = stepMap[progress.step];
    if (currentIndex !== undefined) {
      for (let i = 0; i < currentIndex; i++) {
        steps[i].status = 'completed';
      }
      steps[currentIndex].status = 'active';
    }

    return steps;
  };

  const getStatusBadge = (status: string | null) => {
    if (status === null) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Pending</span>
      );
    }
    switch (status) {
      case 'inProgress':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">In Progress</span>
        );
      case 'ready':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Ready</span>
        );
      case 'expired':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Expired</span>;
      case 'revoked':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Revoked</span>;
      case 'rejected':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Rejected</span>
        );
      case 'deletionInProgress':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
            Deleting
          </span>
        );
      default:
        return null;
    }
  };

  const isMinting = progress.step !== 'idle' && progress.step !== 'done' && progress.step !== 'error';

  if (!isAuthenticated) {
    return (
      <SplitLayout
        snippets={mintSnippets}
        defaultSnippetId="ensureBucket"
        pageTitle="Mint NFT"
        pageDescription="Upload an image to DataHaven and mint it as an NFT."
      >
        <Card>
          <div className="text-center py-8">
            <p className="text-dh-300 mb-4">Please connect your wallet and authenticate to mint NFTs.</p>
            <Button onClick={connectAndAuthenticate} isLoading={isLoading}>
              Connect & Authenticate
            </Button>
          </div>
        </Card>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout
      snippets={mintSnippets}
      defaultSnippetId="ensureBucket"
      pageTitle="Mint NFT"
      pageDescription="Upload an image to DataHaven and mint it as an NFT on the DataHaven Testnet."
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

      {/* Ensure Bucket */}
      <Card title="Ensure Storage Bucket" onClick={() => setActiveSnippet('ensureBucket')}>
        <div className="space-y-3">
          <p className="text-xs text-dh-400">
            Each user gets a dedicated bucket (folder) for NFT assets on DataHaven. The bucket must exist before you can
            upload files. Images and metadata for your NFTs will be stored here, and the bucket is linked to your
            on-chain identity.
          </p>

          <div className="bg-dh-900 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dh-400">Bucket Name</span>
              <span className="text-xs font-mono text-dh-200">{bucketName || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-dh-400">Bucket ID</span>
              <span className="text-xs font-mono text-dh-200">{bucketId ? truncateHash(bucketId) : '—'}</span>
            </div>
            {mspId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-dh-400">MSP ID</span>
                <span className="text-xs font-mono text-dh-200">{truncateHash(mspId)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-dh-400">Visibility</span>
              <span className="text-xs text-dh-200">Public</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-dh-400">Status</span>
              {bucketLoading ? (
                <span className="text-xs text-dh-500">Checking...</span>
              ) : bucketExists === null ? (
                <span className="text-xs text-dh-500">Not checked</span>
              ) : (
                <StatusBadge
                  status={bucketExists ? 'connected' : 'disconnected'}
                  label={bucketExists ? 'Exists' : 'Not Created'}
                />
              )}
            </div>
          </div>

          {bucketExists === false && (
            <Button onClick={handleCreateBucket} isLoading={bucketCreating} size="sm" className="w-full">
              Create Bucket
            </Button>
          )}

          {bucketExists && <p className="text-xs text-green-400">Bucket is ready for file uploads.</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <Card title="NFT Mint Process">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-dh-200 mb-1">Name</label>
              <input
                type="text"
                value={nftName}
                onChange={(e) => setNftName(e.target.value)}
                placeholder="My DataHaven NFT"
                disabled={isMinting}
                className="w-full px-3 py-2 bg-dh-900 border border-dh-700 rounded-lg text-dh-100 placeholder-dh-500 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-dh-200 mb-1">Description</label>
              <textarea
                value={nftDescription}
                onChange={(e) => setNftDescription(e.target.value)}
                placeholder="A unique NFT with metadata stored on DataHaven"
                rows={3}
                disabled={isMinting}
                className="w-full px-3 py-2 bg-dh-900 border border-dh-700 rounded-lg text-dh-100 placeholder-dh-500 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent disabled:opacity-50 resize-none"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-dh-200 mb-1">Image</label>
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="NFT preview"
                    className="w-full h-48 object-cover rounded-lg border border-dh-700"
                  />
                  {!isMinting && (
                    <button
                      onClick={clearSelection}
                      className="absolute top-2 right-2 p-1 bg-dh-800/80 rounded-full text-dh-300 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                  <p className="mt-1 text-xs text-dh-400">
                    {selectedFile?.name} ({(selectedFile?.size ?? 0 / 1024).toFixed(1)} KB)
                  </p>
                </div>
              ) : (
                <div
                  onClick={() => !isMinting && fileInputRef.current?.click()}
                  className={`border-2 border-dashed border-dh-700 rounded-lg p-8 text-center ${
                    isMinting ? 'opacity-50 cursor-not-allowed' : 'hover:border-sage-600 cursor-pointer'
                  } transition-colors`}
                >
                  <svg
                    className="w-8 h-8 mx-auto text-dh-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2" />
                    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
                  </svg>
                  <p className="text-sm text-dh-300">Click to select an image</p>
                  <p className="text-xs text-dh-400 mt-1">PNG, JPG, GIF up to 10MB</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </div>

            {/* Mint Button */}
            {progress.step === 'done' ? (
              <Button onClick={resetForm} variant="secondary" className="w-full">
                Mint Another NFT
              </Button>
            ) : (
              <Button
                onClick={handleMint}
                isLoading={isMinting}
                disabled={!selectedFile || !nftName || isMinting}
                className="w-full"
                size="lg"
              >
                {isMinting ? 'Minting...' : 'Mint NFT'}
              </Button>
            )}
          </div>
        </Card>

        {/* Right: Progress */}
        <Card title="Minting Progress">
          <div className="space-y-4">
            <ProgressStepper steps={getSteps()} />

            {progress.step === 'idle' ? (
              <div className="p-3 bg-dh-900 rounded-lg">
                <p className="text-sm text-dh-400">Fill in the NFT details and click "Mint NFT" to begin.</p>
                <p className="text-xs text-dh-500 mt-1">
                  Your image and metadata will be stored on DataHaven, and the NFT will be minted on-chain.
                </p>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-dh-900 rounded-lg">
                <p
                  className={`text-sm ${
                    progress.step === 'done'
                      ? 'text-green-400'
                      : progress.step === 'error'
                        ? 'text-red-400'
                        : 'text-sage-400'
                  }`}
                >
                  {progress.message}
                </p>
              </div>
            )}

            {mintResult && (
              <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
                <p className="text-sm font-medium text-green-400">NFT Minted Successfully!</p>
                <div>
                  <p className="text-xs text-dh-400">Token ID</p>
                  <p className="text-sm font-mono text-dh-200">#{mintResult.tokenId}</p>
                </div>
                <div>
                  <p className="text-xs text-dh-400">Transaction Hash</p>
                  <p className="text-sm font-mono text-dh-200 break-all">{mintResult.txHash}</p>
                </div>
                <a href="/gallery" className="inline-block mt-2 text-sm text-sage-400 hover:text-sage-300">
                  View in Gallery
                </a>
              </div>
            )}

            {/* File Confirmation Status */}
            {fileConfirmations.length > 0 && (
              <div className="mt-4 p-4 bg-dh-900 border border-dh-700 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-dh-200">File Confirmation Status</p>
                  {fileConfirmations.every((fc) => fc.status === 'ready') && (
                    <span className="text-xs text-green-400">All files ready</span>
                  )}
                </div>
                {fileConfirmations.map((fc) => (
                  <div key={fc.fileKey} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-dh-300">{fc.label}</span>
                      <span className="text-xs font-mono text-dh-500 truncate max-w-[120px]">{fc.fileKey}</span>
                    </div>
                    {getStatusBadge(fc.status)}
                  </div>
                ))}
                {!fileConfirmations.every((fc) => isTerminal(fc.status)) && (
                  <p className="text-xs text-dh-500">
                    Files may take up to 11 minutes to become downloadable while the network confirms them.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </SplitLayout>
  );
}
