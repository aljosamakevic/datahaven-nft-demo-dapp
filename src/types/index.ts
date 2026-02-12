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
  image: string; // DataHaven file key for the image
}

export interface MintedNFT {
  tokenId: number;
  owner: string;
  tokenURI: string; // DataHaven file key for the metadata JSON
  metadata: NFTMetadata | null; // null if metadata fetch failed (e.g., file expired)
  imageUrl: string | null; // blob URL for display, null if image fetch failed
}

export interface MintProgress {
  step: 'idle' | 'ensuring-bucket' | 'uploading-image' | 'confirming-image' | 'uploading-metadata' | 'confirming-metadata' | 'minting' | 'done' | 'error';
  message: string;
}
