export const UNISWAP_V4_BSC_POOL_MANAGER = process.env.UNISWAP_V4_BSC_POOL_MANAGER ?? '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df';
export const UNISWAP_V4_POOL_MANAGER_ABI = [
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)',
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
];
export const UNISWAP_V4_ERC20_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'];