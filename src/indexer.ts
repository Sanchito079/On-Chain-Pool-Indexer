import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { decodeMetadataSymbol, decodeMintDecimals, decodePool, metadataAddress, poolDiscriminator } from './decoder.js';
import { PUMPSWAP_PROGRAM_ID } from './constants.js';
import { PoolDatabase } from './db.js';

export class PumpSwapIndexer {
  constructor(private readonly connection: Connection, private readonly database: PoolDatabase) {}

  async sync(): Promise<number> {
    const [poolKeys, slot] = await Promise.all([
      this.connection.getProgramAccounts(PUMPSWAP_PROGRAM_ID, {
        commitment: 'confirmed',
        dataSlice: { offset: 0, length: 0 },
        filters: [{ memcmp: { offset: 0, bytes: bs58.encode(poolDiscriminator()) } }],
      }).then((accounts) => accounts.map(({ pubkey }) => pubkey)),
      this.connection.getSlot('confirmed'),
    ]);
    const accounts: { pubkey: PublicKey; account: NonNullable<Awaited<ReturnType<Connection['getAccountInfo']>>> }[] = [];
    for (let offset = 0; offset < poolKeys.length; offset += 100) {
      const batch = await this.connection.getMultipleAccountsInfo(poolKeys.slice(offset, offset + 100), 'confirmed');
      for (const [index, account] of batch.entries()) if (account) accounts.push({ pubkey: poolKeys[offset + index], account });
    }
    const mints = [...new Set(accounts.flatMap(({ account }) => {
      const data = account.data as Buffer;
      return [new PublicKey(data.subarray(43, 75)).toBase58(), new PublicKey(data.subarray(75, 107)).toBase58()];
    }))].map((address) => new PublicKey(address));
    const mintAccounts = await this.connection.getMultipleAccountsInfo(mints, 'confirmed');
    const decimals = new Map<string, number>();
    for (const [index, account] of mintAccounts.entries()) if (account) decimals.set(mints[index].toBase58(), decodeMintDecimals(account.data));
    const metadataKeys = mints.map((mint) => metadataAddress(mint.toBase58()));
    const metadataAccounts = await this.connection.getMultipleAccountsInfo(metadataKeys, 'confirmed');
    const symbols = new Map<string, string | null>();
    for (const [index, account] of metadataAccounts.entries()) symbols.set(mints[index].toBase58(), account ? decodeMetadataSymbol(account.data) : null);
    for (const { pubkey, account } of accounts) this.database.upsert(decodePool(pubkey.toBase58(), account.data as Buffer, slot, decimals, symbols, new Map()));
    return accounts.length;
  }
}