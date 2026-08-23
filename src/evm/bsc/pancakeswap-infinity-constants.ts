export const PANCAKESWAP_INFINITY_CL_MANAGER = process.env.PANCAKESWAP_INFINITY_CL_MANAGER ?? '';
export const PANCAKESWAP_INFINITY_CL_MANAGER_ABI = [
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)',
];
export const ERC20_METADATA_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'];