import { Connection, ParsedTransactionWithMeta, PublicKey, AccountInfo } from '@solana/web3.js';

const retryable = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate limit|too many|timeout|temporar|fetch failed|ECONNRESET|5\d\d/i.test(message);
};

export class RotatingRpc {
  private current = 0;

  constructor(private readonly urls: string[]) {
    if (!urls.length) throw new Error('At least one HTTP Solana RPC URL is required');
  }

  private async call<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.urls.length; attempt += 1) {
      const index = (this.current + attempt) % this.urls.length;
      try {
        const result = await operation(new Connection(this.urls[index], 'confirmed'));
        this.current = index;
        return result;
      } catch (error) {
        lastError = error;
        if (!retryable(error)) throw error;
      }
    }
    throw lastError;
  }

  getParsedTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
    return this.call((connection) => connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }));
  }

  getMultipleAccountsInfo(publicKeys: PublicKey[]): Promise<Array<AccountInfo<Buffer> | null>> {
    return this.call((connection) => connection.getMultipleAccountsInfo(publicKeys, 'confirmed'));
  }

  getAccountInfo(publicKey: PublicKey): Promise<AccountInfo<Buffer> | null> {
    return this.call((connection) => connection.getAccountInfo(publicKey, 'confirmed'));
  }

  getSlot(): Promise<number> {
    return this.call((connection) => connection.getSlot('confirmed'));
  }
}

export function httpRpcUrls(): string[] {
  const value = process.env.SOLANA_HTTP_RPC_URLS ?? process.env.SOLANA_HTTP_RPC_URL ?? process.env.SOLANA_RPC_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  return (value ?? '').split(',').map((url) => url.trim()).filter(Boolean);
}