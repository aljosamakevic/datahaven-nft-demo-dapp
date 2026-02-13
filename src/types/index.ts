import type { Bucket, FileListResponse, HealthStatus, InfoResponse, UserInfo } from '@storagehub-sdk/msp-client';

export type { Bucket, FileListResponse, HealthStatus, InfoResponse, UserInfo };

export interface AppState {
  isWalletConnected: boolean;
  isMspConnected: boolean;
  isAuthenticated: boolean;
  address: string | null;
  mspInfo: InfoResponse | null;
  userProfile: UserInfo | null;
}

export interface BucketInfo {
  bucketId: string;
  userId: string;
  mspId: string;
  private: boolean;
  root: string;
  valuePropositionId: string;
}

// NFT-specific types

export interface NFTMetadata {
  name: string;
  description: string;
  image: string; // Public download URL for the image
}

export interface MintedNFT {
  tokenId: number;
  owner: string;
  tokenURI: string; // DataHaven file key for the metadata JSON
  metadata: NFTMetadata | null; // null if metadata fetch failed (e.g., file expired)
  imageUrl: string | null; // Public download URL, null if unavailable
}

export interface MintProgress {
  step: 'idle' | 'ensuring-bucket' | 'uploading-image' | 'uploading-metadata' | 'minting' | 'done' | 'error';
  message: string;
}

export type FileStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface FileConfirmation {
  label: string;
  fileKey: string;
  status: FileStatus;
  error?: string;
}
