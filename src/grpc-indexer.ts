import ClientModule, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import bs58 from 'bs58';
import { PUMPSWAP_PROGRAM_ID } from './constants.js';

export class PumpSwapGrpcIndexer {
  private readonly client: { subscribe(): Promise<{ on(event: string, listener: (update: SubscribeUpdate) => void): void; write(request: SubscribeRequest): boolean }> };

  constructor(endpoint: string, apiKey: string, private readonly onPoolTransaction: (signature: string, slot: number) => Promise<void>, private readonly onPriceTransaction: (update: SubscribeUpdate) => Promise<void>) {
    const Client = ClientModule as unknown as new (url: string, token: string, options?: undefined) => { subscribe(): Promise<{ on(event: string, listener: (update: SubscribeUpdate) => void): void; write(request: SubscribeRequest): boolean }> };
    this.client = new Client(endpoint, apiKey, undefined);
  }

  async start(): Promise<void> {
    const stream = await this.client.subscribe();
    const eventStream = stream as unknown as { on(event: string, listener: (...args: never[]) => void): void; write(request: SubscribeRequest): boolean };
    eventStream.on('data', (update: SubscribeUpdate) => {
      const transaction = update.transaction;
      if (!transaction?.transaction) return;
      const signature = bs58.encode(transaction.transaction.signature);
      const logs = (transaction.transaction.meta as { logMessages?: string[] } | undefined)?.logMessages ?? [];
      const callback = logs.some((log) => /instruction:\s*create[_ ]?pool/i.test(log)) ? this.onPoolTransaction : logs.some((log) => /instruction:\s*(buy|sell|deposit|withdraw)/i.test(log)) ? this.onPriceTransaction : undefined;
      if (!callback) return;
      const task = callback === this.onPriceTransaction
        ? this.onPriceTransaction(update)
        : this.onPoolTransaction(signature, Number(transaction.slot));
      void task.catch((error: unknown) => {
        console.error(`Tatum transaction ${signature} failed:`, error);
      });
    });
    eventStream.on('error', (error: Error) => console.error('Tatum gRPC stream error:', error.message));
    eventStream.on('end', () => console.error('Tatum gRPC stream ended.'));
    const request: SubscribeRequest = {
      accounts: {}, slots: {},
      transactions: {
        pumpswap: {
          vote: false, failed: false, accountInclude: [PUMPSWAP_PROGRAM_ID.toBase58()],
          accountExclude: [], accountRequired: [],
        },
      },
      transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {},
      accountsDataSlice: [], commitment: CommitmentLevel.CONFIRMED,
    };
    eventStream.write(request);
    console.log('Tatum Yellowstone gRPC PumpSwap stream active.');
    await new Promise<void>((resolve, reject) => {
      eventStream.on('close', resolve);
      eventStream.on('error', reject);
    });
  }
}