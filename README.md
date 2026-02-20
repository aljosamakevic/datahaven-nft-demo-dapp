# DataHaven NFT Demo dApp

A demo dApp for minting NFTs whose metadata and images are stored on the DataHaven network via the StorageHub SDK. The NFT smart contract is deployed on the DataHaven Testnet. This implementation showcases the full lifecycle of "mortal NFTs" — NFTs that are alive as long as the owner pays for file storage on DataHaven.

## Features

- **One-click connection** -- connects wallet, MSP, and authenticates via SIWE in a single flow from the navbar (2 wallet signatures)
- **NFT minting** -- 4-step guided wizard: ensure storage bucket, upload image to DataHaven, build and upload ERC-721 metadata, mint NFT on-chain
- **NFT gallery** -- browse your minted NFTs with images fetched from DataHaven, expandable detail panels with file statuses and metadata
- **File status monitoring** -- real-time polling of on-chain file statuses (ready, in progress, expired, deletion in progress)
- **Update NFT files** -- upload a new image and metadata, then update the on-chain token URI to point to the new files
- **Delete NFT files** -- request on-chain file deletion from DataHaven while keeping the token on-chain
- **Burn NFTs** -- destroy the on-chain token and automatically delete associated DataHaven files
- **Mortal NFTs** -- NFTs that are "alive" when files are accessible and "dead" when storage expires or files are deleted
- **Interactive code panel** -- split-view layout showing the relevant source code for each operation, with tooltips on snippet tabs

## Smart Contract

The `DataHavenNFT` contract (`contracts/DataHavenNFT.sol`) is a simple ERC-721 with:

- `mint(uri)` -- open minting, anyone can mint with a metadata URI (DataHaven file key)
- `updateTokenURI(tokenId, newUri)` -- owner can re-point to new metadata after re-uploading expired files
- `burn(tokenId)` -- owner can destroy the NFT if underlying files are permanently lost
- `totalSupply()` -- returns the total number of minted tokens

After deploying the contract, update the address in `src/config/nftContract.ts`.

## Tech Stack

- **React 19** with TypeScript
- **Vite 7** -- build tool and dev server
- **Tailwind CSS v4** -- styling with custom DataHaven theme
- **viem** -- EVM wallet interaction and NFT contract calls
- **@polkadot/api** -- Substrate chain queries
- **@storagehub-sdk/core** -- `StorageHubClient` and `FileManager` for on-chain storage operations
- **@storagehub-sdk/msp-client** -- `MspClient` for MSP HTTP API (file upload, auth, info)
- **react-router-dom** -- client-side routing

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

The app will be available at `http://localhost:5173`. The DataHaven Testnet network will be added to your wallet automatically when you connect.

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
  App.tsx                         # Router (Dashboard, Mint, Gallery)
  main.tsx                        # React entry point
  index.css                       # Tailwind imports, custom theme, grid styles

  components/
    Layout.tsx                    # Navbar with WalletDropdown, page shell
    WalletDropdown.tsx            # Connect button / wallet status dropdown
    Button.tsx                    # Reusable button (primary/secondary/danger)
    Card.tsx                      # Content card wrapper
    StatusBadge.tsx               # Colored status badges (connected, healthy, etc.)
    SplitLayout.tsx               # Two-column layout with code panel toggle
    CodePanel.tsx                 # Syntax-highlighted code snippet viewer
    CodeToggleButton.tsx          # Toggle for code panel visibility
    Icons.tsx                     # SVG icon components

  pages/
    Dashboard.tsx                 # 3-step connection dashboard (home page)
    MintNFT.tsx                   # 4-step wizard: bucket, image, metadata, mint
    Gallery.tsx                   # Your NFTs: expand, update, delete, burn

  context/
    AppContext.tsx                 # Global state: wallet, MSP, auth, one-click connect

  hooks/
    useAppState.ts                # Typed hook for AppContext
    useCodePanel.ts               # Code panel visibility state

  config/
    networks.ts                   # DataHaven Testnet config (RPC, MSP, chain ID)
    nftContract.ts                # NFT contract address and ABI
    codeSnippets.ts               # Source code snippets for the code panel

  services/
    clientService.ts              # Wallet, StorageHubClient, Polkadot API singletons
    mspService.ts                 # MspClient singleton, SIWE auth, session management
    index.ts                      # Service re-exports

  operations/
    nftOperations.ts              # Mint, burn, update token URI, fetch NFTs
    storageOperations.ts          # Bucket, upload, delete, file status, download URLs
    index.ts                      # Operation re-exports

  types/
    index.ts                      # AppState, MintedNFT, FileStatus, SDK type re-exports

contracts/
  DataHavenNFT.sol                # Solidity source (deploy separately)
```

## Network Configuration

| Property | Value |
|----------|-------|
| Network | DataHaven Testnet |
| Chain ID | 55931 (`0xda7b`) |
| RPC URL | `https://services.datahaven-testnet.network/testnet` |
| MSP URL | `https://deo-dh-backend.testnet.datahaven-infra.network/` |
| NFT Contract | `0x81c56bB494417C1840d34510FE1fbE251ee83B51` |
| Currency | MOCK (18 decimals) |

## Usage Flow

1. **Connect** -- click "Connect" in the navbar; the app connects your wallet, switches to DataHaven Testnet, establishes the MSP connection, and authenticates via SIWE in one flow
2. **Mint NFT** -- select an image, enter a name and description, and mint; the dApp handles bucket creation, image upload, metadata upload, on-chain confirmation, and minting
3. **Browse Gallery** -- view your minted NFTs with images loaded from DataHaven; expand any card to see file statuses, metadata JSON, and actions
4. **Update NFT** -- upload a new image and metadata, then update the on-chain token URI
5. **Delete files** -- remove files from DataHaven storage while keeping the token on-chain (NFT shows as "Dead")
6. **Burn NFT** -- destroy the token on-chain and delete its DataHaven files

## Architecture

### Connection Flow

The app uses a one-click connection accessible from the navbar on any page:

1. **Init WASM** -- StorageHub SDK requires WASM initialization (once per session)
2. **Connect Wallet** -- MetaMask popup for account access, auto-switches to DataHaven Testnet
3. **Init Polkadot API** -- connects to the Substrate side of the chain via WebSocket
4. **Connect to MSP** -- establishes connection to the storage provider (no user interaction)
5. **Authenticate (SIWE)** -- MetaMask popup to sign a SIWE message, receives a session token

Each step commits its success to state immediately, so partial failures preserve progress. The Dashboard page at `/` presents this flow as three interactive cards. The wallet dropdown in the navbar also exposes the individual connection steps and provides health checks and disconnect.

### Storage Flow

1. **Ensure bucket** -- derives a per-user bucket (`nft-assets-{address}`) and creates it on-chain if needed
2. **Upload file** -- hashes with `FileManager`, registers on-chain via `issueStorageRequest`, uploads bytes to MSP
3. **Wait for confirmation** -- polls on-chain until the MSP confirms the file
4. **Public download** -- files are accessible at `{mspUrl}download/{fileKey}`

### NFT Lifecycle

- **Alive** -- both metadata and image files are accessible on DataHaven
- **Dead** -- files are expired or deleted; gallery shows a placeholder image
- **Update** -- upload new files, call `updateTokenURI` to re-point the token
- **Delete files** -- request on-chain deletion; token remains but shows as Dead
- **Burn** -- destroy token on-chain, then best-effort delete DataHaven files

## License

MIT
