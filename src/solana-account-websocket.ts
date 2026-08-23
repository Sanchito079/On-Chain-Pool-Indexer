import WebSocket from 'ws';

type AccountHandler = (data: Uint8Array, slot: number) => void;
type RpcMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
  method?: string;
  params?: { subscription?: number; result?: { context?: { slot?: number }; value?: { data?: [string, string] | string } } };
};

export class SolanaAccountWebSocket {
  private nextId = 1;
  private endpointIndex = 0;
  private socket: WebSocket | undefined;
  private readonly handlers = new Map<string, AccountHandler>();
  private readonly subscriptions = new Map<number, string>();
  private readonly pending = new Map<number, (message: RpcMessage) => void>();

  constructor(private readonly endpoints: string[]) {
    if (!endpoints.length) throw new Error('At least one Solana WebSocket endpoint is required');
  }

  addAccount(address: string, handler: AccountHandler): void {
    this.handlers.set(address, handler);
    if (this.socket) void this.subscribe(address).catch((error: unknown) => console.error(`Account subscription failed for ${address}:`, error));
  }

  async start(): Promise<void> {
    while (true) {
      try { await this.connectCurrent(); }
      catch (error) { console.error(`Solana WebSocket ${this.displayEndpoint()} failed:`, error instanceof Error ? error.message : error); }
      this.endpointIndex = (this.endpointIndex + 1) % this.endpoints.length;
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async connectCurrent(): Promise<void> {
    const socket = new WebSocket(this.endpoints[this.endpointIndex]);
    this.socket = socket;
    this.subscriptions.clear();
    socket.on('message', (raw) => {
      try { this.handleMessage(JSON.parse(raw.toString()) as RpcMessage); }
      catch (error) { console.error('Invalid Solana account WebSocket message:', error); }
    });
    socket.on('error', (error) => console.error('Solana account WebSocket error:', error.message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    for (const address of this.handlers.keys()) await this.subscribe(address);
    console.log(`Solana account WebSocket active on ${this.displayEndpoint()} (${this.subscriptions.size} accounts).`);
    await new Promise<void>((resolve, reject) => { socket.once('close', resolve); socket.once('error', reject); });
    this.socket = undefined;
  }

  private request(method: string, params: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 8_000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        message.error ? reject(new Error(message.error.message ?? 'Solana WebSocket request failed')) : resolve(message.result);
      });
      this.socket?.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  private displayEndpoint(): string {
    try { return new URL(this.endpoints[this.endpointIndex]).host; }
    catch { return 'configured endpoint'; }
  }

  private async subscribe(address: string): Promise<void> {
    if ([...this.subscriptions.values()].includes(address)) return;
    const subscription = Number(await this.request('accountSubscribe', [address, { commitment: 'confirmed', encoding: 'base64' }]));
    this.subscriptions.set(subscription, address);
  }

  private handleMessage(message: RpcMessage): void {
    if (message.id !== undefined) {
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
      return;
    }
    if (message.method !== 'accountNotification' || message.params?.subscription === undefined) return;
    const address = this.subscriptions.get(message.params.subscription);
    const value = message.params.result?.value;
    const slot = message.params.result?.context?.slot;
    if (!address || !value?.data || slot === undefined) return;
    const encoded = Array.isArray(value.data) ? value.data[0] : value.data;
    this.handlers.get(address)?.(Buffer.from(encoded, 'base64'), slot);
  }
}

export function solanaWsUrls(): string[] {
  const configured = (process.env.SOLANA_WS_RPC_URLS ?? '').split(',').map((url) => url.trim()).filter(Boolean);
  const primary = process.env.SOLANA_WS_RPC_URL?.trim();
  if (primary && !configured.includes(primary)) configured.unshift(primary);
  const publicEndpoint = 'wss://api.mainnet-beta.solana.com';
  if (!configured.includes(publicEndpoint)) configured.push(publicEndpoint);
  return configured;
}