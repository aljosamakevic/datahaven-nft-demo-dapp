import { decodeEventLog } from 'viem';
import {
  getPublicClient,
  getWalletClient,
  getConnectedAddress,
  buildGasTxOpts,
} from '../services/clientService';
import { chain } from '../services/clientService';
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from '../config/nftContract';
import { getDownloadUrl } from './storageOperations';
import type { NFTMetadata, MintedNFT } from '../types';

// Mint an NFT with the given metadata URI (DataHaven file key)
export async function mintNFT(metadataFileKey: string): Promise<{ tokenId: number; txHash: string }> {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  const address = getConnectedAddress();

  if (!address) {
    throw new Error('Wallet not connected');
  }

  const gasTxOpts = await buildGasTxOpts();

  const txHash = await walletClient.writeContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: 'mint',
    args: [metadataFileKey],
    chain,
    account: address as `0x${string}`,
    gas: gasTxOpts.gas,
    maxFeePerGas: gasTxOpts.maxFeePerGas,
    maxPriorityFeePerGas: gasTxOpts.maxPriorityFeePerGas,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error(`Mint transaction failed: ${txHash}`);
  }

  // Parse NFTMinted event to get tokenId
  let tokenId = -1;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: NFT_CONTRACT_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'NFTMinted') {
        tokenId = Number((decoded.args as { tokenId: bigint }).tokenId);
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  if (tokenId === -1) {
    throw new Error('Could not find NFTMinted event in transaction receipt');
  }

  return { tokenId, txHash };
}

// Update the token URI (for re-uploading expired files)
export async function updateTokenURI(tokenId: number, newMetadataFileKey: string): Promise<string> {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  const address = getConnectedAddress();

  if (!address) {
    throw new Error('Wallet not connected');
  }

  const gasTxOpts = await buildGasTxOpts();

  const txHash = await walletClient.writeContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: 'updateTokenURI',
    args: [BigInt(tokenId), newMetadataFileKey],
    chain,
    account: address as `0x${string}`,
    gas: gasTxOpts.gas,
    maxFeePerGas: gasTxOpts.maxFeePerGas,
    maxPriorityFeePerGas: gasTxOpts.maxPriorityFeePerGas,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error(`Update token URI failed: ${txHash}`);
  }

  return txHash;
}

// Burn an NFT
export async function burnNFT(tokenId: number): Promise<string> {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  const address = getConnectedAddress();

  if (!address) {
    throw new Error('Wallet not connected');
  }

  const gasTxOpts = await buildGasTxOpts();

  const txHash = await walletClient.writeContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: 'burn',
    args: [BigInt(tokenId)],
    chain,
    account: address as `0x${string}`,
    gas: gasTxOpts.gas,
    maxFeePerGas: gasTxOpts.maxFeePerGas,
    maxPriorityFeePerGas: gasTxOpts.maxPriorityFeePerGas,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error(`Burn transaction failed: ${txHash}`);
  }

  return txHash;
}

// Read total supply from contract
export async function getTotalSupply(): Promise<number> {
  const publicClient = getPublicClient();

  const result = await publicClient.readContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: 'totalSupply',
  });

  return Number(result);
}

// Read token URI from contract
export async function getTokenURI(tokenId: number): Promise<string> {
  const publicClient = getPublicClient();

  const result = await publicClient.readContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: 'tokenURI',
    args: [BigInt(tokenId)],
  });

  return result as string;
}

// Read owner of a token
export async function getOwnerOf(tokenId: number): Promise<string> {
  const publicClient = getPublicClient();

  const result = await publicClient.readContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: 'ownerOf',
    args: [BigInt(tokenId)],
  });

  return result as string;
}

// Fetch NFT metadata from DataHaven via public download URL
export async function fetchNFTMetadata(metadataFileKey: string): Promise<NFTMetadata> {
  const response = await fetch(getDownloadUrl(metadataFileKey));
  if (!response.ok) {
    throw new Error(`Metadata fetch failed with status: ${response.status}`);
  }
  const metadata: NFTMetadata = await response.json();
  return metadata;
}

// Fetch a single NFT with all its data
export async function fetchNFT(tokenId: number): Promise<MintedNFT> {
  const [tokenURI, owner] = await Promise.all([
    getTokenURI(tokenId),
    getOwnerOf(tokenId),
  ]);

  let metadata: NFTMetadata | null = null;
  let imageUrl: string | null = null;

  try {
    metadata = await fetchNFTMetadata(tokenURI);

    if (metadata.image) {
      imageUrl = metadata.image;
    }
  } catch {
    // Metadata or image fetch failed — file may be expired
  }

  return {
    tokenId,
    owner,
    tokenURI,
    metadata,
    imageUrl,
  };
}

// Fetch all minted NFTs
export async function fetchAllNFTs(): Promise<MintedNFT[]> {
  const totalSupply = await getTotalSupply();
  const nfts: MintedNFT[] = [];

  // Fetch in batches to avoid overwhelming the network
  const batchSize = 5;
  for (let i = 0; i < totalSupply; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, totalSupply); j++) {
      batch.push(
        fetchNFT(j).catch(() => ({
          tokenId: j,
          owner: '',
          tokenURI: '',
          metadata: null,
          imageUrl: null,
        }))
      );
    }
    const results = await Promise.all(batch);
    nfts.push(...results);
  }

  return nfts;
}
