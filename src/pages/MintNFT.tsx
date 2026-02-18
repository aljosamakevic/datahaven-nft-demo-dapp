import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
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
import type { FileConfirmation } from '../types';

// Step number badge shown in card headers
function StepBadge({ step, completed }: { step: number; completed: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mr-2 ${
        completed ? 'bg-green-500 text-white' : 'bg-sage-600 text-white'
      }`}
    >
      {completed ? (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        step
      )}
    </span>
  );
}

// Lock icon for disabled steps
function LockOverlay() {
  return (
    <div className="absolute inset-0 bg-dh-800/60 rounded-lg flex items-center justify-center z-10 backdrop-blur-[1px]">
      <div className="flex items-center space-x-2 text-dh-500">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeWidth="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-sm">Complete previous step first</span>
      </div>
    </div>
  );
}

export function MintNFT() {
  const { isAuthenticated, address, handleAuthError, connectAndAuthenticate, isLoading } = useAppState();

  const [activeSnippet, setActiveSnippet] = useState('ensureBucket');

  // Bucket state (Step 1)
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [bucketExists, setBucketExists] = useState<boolean | null>(null);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [bucketCreating, setBucketCreating] = useState(false);
  const [mspId, setMspId] = useState<string | null>(null);

  // Image upload state (Step 2)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFileKey, setImageFileKey] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  // Metadata state (Step 3)
  const [nftName, setNftName] = useState('');
  const [nftDescription, setNftDescription] = useState('');
  const [metadataFileKey, setMetadataFileKey] = useState<string | null>(null);
  const [metadataUploading, setMetadataUploading] = useState(false);

  // Mint state (Step 4)
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState<{ tokenId: number; txHash: string } | null>(null);

  // Shared
  const [error, setError] = useState<string | null>(null);

  // Post-mint file status tracking
  const [fileConfirmations, setFileConfirmations] = useState<FileConfirmation[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const bucketName = address ? getNftBucketName(address) : null;

  // Derived wizard state
  const step1Complete = bucketExists === true;
  const step2Complete = imageFileKey !== null;
  const step3Complete = metadataFileKey !== null;
  const step4Complete = mintResult !== null;

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

      const polkadotApi = getPolkadotApi();
      const bucketOnChain = await polkadotApi.query.providers.buckets(id);
      setBucketExists(!bucketOnChain.isEmpty);

      try {
        const info = await getMspInfo();
        setMspId(info.mspId);
      } catch {
        // Non-critical
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

  // Step 2: Upload image
  const handleUploadImage = async () => {
    if (!selectedFile || !bucketId) return;
    setImageUploading(true);
    setError(null);
    setActiveSnippet('uploadImage');
    try {
      const fileBuffer = await selectedFile.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      const fileKey = await uploadFileToDH(
        bucketId,
        `image-${Date.now()}-${selectedFile.name}`,
        fileBytes,
        selectedFile.size
      );
      await waitForMSPConfirmOnChain(fileKey);
      setImageFileKey(fileKey);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  // Step 3: Upload metadata
  const handleUploadMetadata = async () => {
    if (!imageFileKey || !nftName || !bucketId) return;
    setMetadataUploading(true);
    setError(null);
    setActiveSnippet('uploadMetadata');
    try {
      const metadata = {
        name: nftName,
        description: nftDescription,
        image: getDownloadUrl(imageFileKey),
      };
      const metadataJson = JSON.stringify(metadata, null, 2);
      const encoder = new TextEncoder();
      const metadataBytes = encoder.encode(metadataJson);
      const fileKey = await uploadFileToDH(
        bucketId,
        `metadata-${Date.now()}.json`,
        metadataBytes,
        metadataBytes.length
      );
      await waitForMSPConfirmOnChain(fileKey);
      setMetadataFileKey(fileKey);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Metadata upload failed');
    } finally {
      setMetadataUploading(false);
    }
  };

  // Step 4: Mint NFT
  const handleMintNft = async () => {
    if (!metadataFileKey || !bucketId) return;
    setMinting(true);
    setError(null);
    setActiveSnippet('mintNft');
    try {
      const result = await mintNFT(metadataFileKey);
      setMintResult(result);

      // Start file confirmation polling
      setFileConfirmations([
        { label: 'Image', fileKey: imageFileKey!, status: null },
        { label: 'Metadata', fileKey: metadataFileKey, status: null },
      ]);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Minting failed');
    } finally {
      setMinting(false);
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

  // Terminal file statuses
  const terminalStatuses = ['ready', 'expired', 'revoked', 'rejected'] as const;
  const isTerminal = (status: string | null) =>
    status !== null && terminalStatuses.includes(status as (typeof terminalStatuses)[number]);

  // Background polling for file confirmation status
  const pollFileStatuses = useCallback(async () => {
    if (!bucketId || fileConfirmations.length === 0) return;

    const updated = await Promise.all(
      fileConfirmations.map(async (fc) => {
        if (isTerminal(fc.status)) return fc;
        try {
          const status = await checkFileStatus(bucketId, fc.fileKey);
          return { ...fc, status };
        } catch {
          return fc;
        }
      })
    );

    setFileConfirmations(updated);

    if (updated.every((fc) => isTerminal(fc.status))) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [bucketId, fileConfirmations]);

  // Start polling when file confirmations are set
  useEffect(() => {
    if (mintResult && fileConfirmations.length > 0 && !pollingRef.current) {
      pollFileStatuses();
      pollingRef.current = setInterval(pollFileStatuses, 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [mintResult, fileConfirmations.length, pollFileStatuses]);

  const resetForm = () => {
    setNftName('');
    setNftDescription('');
    clearSelection();
    setImageFileKey(null);
    setMetadataFileKey(null);
    setMintResult(null);
    setError(null);
    setFileConfirmations([]);
    setActiveSnippet('ensureBucket');
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
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
      pageTitle="Mint Mortal NFT"
      pageDescription="Follow each step to upload your image, build metadata, and mint your NFT on-chain."
      activeSnippetId={activeSnippet}
      onSnippetChange={setActiveSnippet}
    >
      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start justify-between">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
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

      {/* ═══════════════════════════════════════════════════════
          STEP 1: Ensure Storage Bucket
          ═══════════════════════════════════════════════════════ */}
      <Card onClick={() => setActiveSnippet('ensureBucket')}>
        <div className="space-y-3">
          <div className="flex items-center">
            <StepBadge step={1} completed={step1Complete} />
            <h3 className="text-lg font-medium text-white">Ensure Storage Bucket</h3>
          </div>
          <p className="text-xs text-dh-400">
            Each user gets a dedicated bucket for NFT assets on DataHaven. The bucket must exist before you can upload
            files.
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

          {step1Complete && <p className="text-xs text-green-400">Bucket is ready for file uploads.</p>}
        </div>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          STEP 2: Upload Image to DataHaven
          ═══════════════════════════════════════════════════════ */}
      <div className="relative">
        {!step1Complete && <LockOverlay />}
        <Card onClick={() => setActiveSnippet('uploadImage')}>
          <div className="space-y-3">
            <div className="flex items-center">
              <StepBadge step={2} completed={step2Complete} />
              <h3 className="text-lg font-medium text-white">Upload Image to DataHaven</h3>
            </div>
            <p className="text-xs text-dh-400">
              Select an image file and upload it to the DataHaven decentralized storage network. The file will be
              registered on-chain and confirmed by the MSP.
            </p>

            {step2Complete ? (
              /* Upload complete */
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm text-green-400 font-medium">Image stored on DataHaven</span>
                </div>
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Uploaded NFT"
                    className="w-full h-32 object-cover rounded-lg border border-dh-700 mt-2"
                  />
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">File Key</span>
                  <span className="text-xs font-mono text-dh-200">{truncateHash(imageFileKey!)}</span>
                </div>
                {selectedFile && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dh-400">File</span>
                    <span className="text-xs text-dh-200">{selectedFile.name}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Upload form */
              <>
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="NFT preview"
                      className="w-full h-48 object-cover rounded-lg border border-dh-700"
                    />
                    {!imageUploading && (
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
                      {selectedFile?.name} ({((selectedFile?.size ?? 0) / 1024).toFixed(1)} KB)
                    </p>
                  </div>
                ) : (
                  <div
                    onClick={() => !imageUploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-dh-700 rounded-lg p-8 text-center ${
                      imageUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-sage-600 cursor-pointer'
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

                <Button
                  onClick={handleUploadImage}
                  isLoading={imageUploading}
                  disabled={!selectedFile || imageUploading}
                  className="w-full"
                >
                  {imageUploading ? 'Uploading to DataHaven...' : 'Upload Image'}
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════
          STEP 3: NFT Metadata
          ═══════════════════════════════════════════════════════ */}
      <div className="relative">
        {!step2Complete && <LockOverlay />}
        <Card onClick={() => setActiveSnippet('uploadMetadata')}>
          <div className="space-y-3">
            <div className="flex items-center">
              <StepBadge step={3} completed={step3Complete} />
              <h3 className="text-lg font-medium text-white">NFT Metadata</h3>
            </div>
            <p className="text-xs text-dh-400">
              Add a name and description for your NFT. The metadata JSON (including the image link) will be uploaded to
              DataHaven and used as the on-chain token URI.
            </p>

            {/* Image on DH indicator */}
            {step2Complete && !step3Complete && (
              <div className="bg-dh-900 rounded-lg p-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs text-green-400 font-medium">Image on DataHaven</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">Image File Key</span>
                  <span className="text-xs font-mono text-dh-200">{truncateHash(imageFileKey!)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">Download URL</span>
                  <span className="text-xs font-mono text-dh-200 truncate max-w-[200px]">
                    {getDownloadUrl(imageFileKey!)}
                  </span>
                </div>
              </div>
            )}

            {step3Complete ? (
              /* Metadata uploaded */
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm text-green-400 font-medium">Metadata stored on DataHaven</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">Metadata File Key</span>
                  <span className="text-xs font-mono text-dh-200">{truncateHash(metadataFileKey!)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">Name</span>
                  <span className="text-xs text-dh-200">{nftName}</span>
                </div>
                {nftDescription && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dh-400">Description</span>
                    <span className="text-xs text-dh-200 truncate max-w-[200px]">{nftDescription}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Metadata form */
              <>
                <div>
                  <label className="block text-sm font-medium text-dh-200 mb-1">Name</label>
                  <input
                    type="text"
                    value={nftName}
                    onChange={(e) => setNftName(e.target.value)}
                    placeholder="My DataHaven NFT"
                    disabled={metadataUploading}
                    className="w-full px-3 py-2 bg-dh-900 border border-dh-700 rounded-lg text-dh-100 placeholder-dh-500 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dh-200 mb-1">Description</label>
                  <textarea
                    value={nftDescription}
                    onChange={(e) => setNftDescription(e.target.value)}
                    placeholder="A unique NFT with metadata stored on DataHaven"
                    rows={3}
                    disabled={metadataUploading}
                    className="w-full px-3 py-2 bg-dh-900 border border-dh-700 rounded-lg text-dh-100 placeholder-dh-500 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent disabled:opacity-50 resize-none"
                  />
                </div>

                {/* Metadata JSON preview */}
                {nftName && imageFileKey && (
                  <div>
                    <label className="block text-xs font-medium text-dh-400 mb-1">Metadata JSON Preview</label>
                    <pre className="bg-dh-900 rounded-lg p-3 text-xs font-mono text-dh-200 overflow-x-auto">
                      {JSON.stringify(
                        {
                          name: nftName,
                          description: nftDescription || '',
                          image: getDownloadUrl(imageFileKey),
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}

                <Button
                  onClick={handleUploadMetadata}
                  isLoading={metadataUploading}
                  disabled={!nftName || metadataUploading}
                  className="w-full"
                >
                  {metadataUploading ? 'Uploading Metadata...' : 'Upload Metadata'}
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════
          STEP 4: Mint NFT
          ═══════════════════════════════════════════════════════ */}
      <div className="relative">
        {!step3Complete && <LockOverlay />}
        <Card onClick={() => setActiveSnippet('mintNft')}>
          <div className="space-y-3">
            <div className="flex items-center">
              <StepBadge step={4} completed={step4Complete} />
              <h3 className="text-lg font-medium text-white">Mint NFT</h3>
            </div>
            <p className="text-xs text-dh-400">
              Call the mint function on the NFT smart contract. The metadata file key will be used as the on-chain token
              URI, linking your NFT to its DataHaven-stored metadata and image.
            </p>

            {/* Pre-mint summary */}
            {step3Complete && !step4Complete && (
              <div className="bg-dh-900 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">Token URI (metadata key)</span>
                  <span className="text-xs font-mono text-dh-200">{truncateHash(metadataFileKey!)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dh-400">Name</span>
                  <span className="text-xs text-dh-200">{nftName}</span>
                </div>
                {nftDescription && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dh-400">Description</span>
                    <span className="text-xs text-dh-200 truncate max-w-[200px]">{nftDescription}</span>
                  </div>
                )}
              </div>
            )}

            {step4Complete ? (
              /* Mint success */
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-medium text-green-400">NFT Minted Successfully!</span>
                  </div>
                  <div>
                    <p className="text-xs text-dh-400">Token ID</p>
                    <p className="text-sm font-mono text-dh-200">#{mintResult!.tokenId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dh-400">Transaction Hash</p>
                    <p className="text-sm font-mono text-dh-200 break-all">{mintResult!.txHash}</p>
                  </div>
                </div>

                {/* File Confirmation Status */}
                {fileConfirmations.length > 0 && (
                  <div className="bg-dh-900 border border-dh-700 rounded-lg p-4 space-y-3">
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

                <div className="flex gap-3">
                  <Button onClick={resetForm} variant="secondary" className="flex-1">
                    Create Another NFT
                  </Button>
                  <a href="/gallery" className="flex-1">
                    <Button variant="primary" className="w-full">
                      Gallery
                    </Button>
                  </a>
                </div>
              </div>
            ) : (
              <Button onClick={handleMintNft} isLoading={minting} disabled={minting} className="w-full" size="lg">
                {minting ? 'Minting...' : 'Mint NFT'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </SplitLayout>
  );
}
