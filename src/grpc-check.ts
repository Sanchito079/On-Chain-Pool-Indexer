import 'dotenv/config';
import ClientModule from '@triton-one/yellowstone-grpc';

const endpoint = process.env.SOLANA_GRPC_ENDPOINT ?? 'https://solana-mainnet-grpc.gateway.tatum.io';
const apiKey = process.env.TATUM_API_KEY;

if (!apiKey) throw new Error('TATUM_API_KEY is required');

const Client = ClientModule as unknown as new (url: string, token: string) => { getVersion(): Promise<string> };
const client = new Client(endpoint, apiKey);
const version = await client.getVersion();
console.log(`Tatum Yellowstone gRPC is healthy (${version}).`);
