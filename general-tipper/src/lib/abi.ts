import { parseAbi } from 'viem'

/** Mirrors contract/src/TipSplitter.sol. */
export const tipSplitterAbi = parseAbi([
  'function tip(string targetURI, address receiver, address host, uint16 ratioBps) payable',
  'function withdraw()',
  'function balances(address account) view returns (uint256)',
  'function BPS_DENOMINATOR() view returns (uint16)',
  'event Tipped(bytes32 indexed targetURIHash, address indexed receiver, address indexed host, address tipper, string targetURI, uint256 amount, uint256 receiverAmount, uint256 hostAmount)',
  'event Withdrawn(address indexed account, uint256 amount)',
  'error ZeroAmount()',
  'error InvalidRatio(uint16 ratio)',
  'error ZeroReceiver()',
  'error HostRequired()',
  'error NothingToWithdraw()',
  'error TransferFailed()',
])
