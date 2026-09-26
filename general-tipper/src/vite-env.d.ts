/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_CHAIN?: 'sepolia' | 'anvil'
  readonly VITE_TIPSPLITTER_ADDRESS?: string
  readonly VITE_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  ethereum?: import('viem').EIP1193Provider
}
