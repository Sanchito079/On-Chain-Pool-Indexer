export const UNISWAP_V3_BSC_FACTORY = process.env.UNISWAP_V3_BSC_FACTORY ?? '0x36696169C63E42Cd08Ce11f5deeBbCeBae652050';
export const UNISWAP_V3_FACTORY_ABI = ['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'];
export const UNISWAP_V3_POOL_ABI = ['event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'];
export const ERC20_METADATA_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'];