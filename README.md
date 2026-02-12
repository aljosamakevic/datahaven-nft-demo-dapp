# DataHaven NFT Demo dApp

A demo dApp for minting NFTs whose metadata and images are stored on the DataHaven network via the StorageHub SDK. The NFT smart contract is deployed on the DataHaven Testnet. This implementation showcases the full lifecycle of "mortal NFTs" — NFTs that are alive as long as the owner pays for file storage on DataHaven.

## Features

- **Wallet Connection** - EVM Wallet interaction with automatic network switching to DataHaven testnet
- **Connection and SIWE Authentication with Main Storage Provider** - Prerequisite for storage and NFT operations
- **NFT Minting** - Upload an image to DataHaven, generate ERC-721 metadata, and mint an NFT on-chain in a guided wizard
- **NFT Gallery** - Browse all minted NFTs with images fetched from DataHaven, filter by ownership
- **Mortal NFTs** - NFTs whose storage can expire; owners can update the metadata URI after re-uploading or burn the NFT if files are permanently lost
- **Storage Provider Monitoring** - View MSP connection status and health

## Smart Contract

The `DataHavenNFT` contract (`contracts/DataHavenNFT.sol`) is a simple ERC-721 with:

- `mint(uri)` - Open minting, anyone can mint with a metadata URI (DataHaven file key)
- `updateTokenURI(tokenId, newUri)` - Owner can re-point to new metadata after re-uploading expired files
- `burn(tokenId)` - Owner can destroy the NFT if underlying files are permanently lost
- `totalSupply()` - Returns the total number of minted tokens

After deploying the contract, update the address in `src/config/nftContract.ts`.

## Tech Stack

- **React 19** with TypeScript
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **viem** - EVM wallet interaction and NFT contract calls
- **@polkadot/api** - Polkadot chain interaction
- **@storagehub-sdk** - StorageHub SDK for storage operations (@storagehub-sdk/core and @storagehub-sdk/msp-client)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- MetaMask or compatible EVM wallet

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
pnpm build
```

### Lint

```bash
pnpm lint
```

## Project Structure

```
src/
├── pages/           # Dashboard, MintNFT, Gallery pages
├── components/      # Reusable UI components
├── context/         # React Context for global state
├── hooks/           # Custom React hooks
├── services/        # Wallet & MSP client services
├── operations/      # Storage and NFT operation logic
├── config/          # Network config, NFT contract ABI, code snippets
└── types/           # TypeScript type definitions
contracts/
└── DataHavenNFT.sol # Solidity source (deploy separately)
```

## Network Configuration

The app connects to the DataHaven Testnet:

| Property | Value |
|----------|-------|
| Network | DataHaven Testnet |
| Chain ID | 55931 (0xda7b) |
| RPC URL | `https://services.datahaven-testnet.network/testnet` |
| Currency | MOCK (18 decimals) |

## Usage Flow

1. **Connect Wallet** - Connect your MetaMask wallet (auto-switches to DataHaven testnet)
2. **Connect to MSP** - Establish connection to the storage provider
3. **Authenticate** - Sign a message to authenticate with the network (SIWE)
4. **Mint NFT** - Select an image, enter a name and description, and mint — the dApp handles bucket creation, image upload, metadata upload, and on-chain minting
5. **Browse Gallery** - View all minted NFTs with images loaded from DataHaven
6. **Manage NFTs** - Update metadata URI or burn NFTs you own

## License

MIT
