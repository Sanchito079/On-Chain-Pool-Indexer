import WebSocket from 'ws';

type LogHandler = (signature: string, slot: number, logs: string[]) => void;
type RpcMessage = { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: { subscription?: number; result?: { context?: { slot?: number }; value?: { signature?: string; logs?: string[]; err?: unknown } } } };

export class SolanaLogWebSocket {
  private endpointIndex = 0;
  private nextId = 1;
  private socket: WebSocket | undefined;
  private readonly pending = new Map<number, (message: RpcMessage) => void>();
  private readonly handlers = new Map<string, LogHandler>();
  private readonly programsBySubscription = new Map<number, string>();
  private readonly signatures = new Set<string>();

  constructor(private readonly endpoints: string[]) {
    if (!endpoints.length) throw new Error('At least one Solana WebSocket endpoint is required');
  }

  addProgram(programId: string, handler: LogHandler): void { this.handlers.set(programId, handler); }

  async start(): Promise<void> {
    while (true) {
      try { await this.connect(); }
      catch (error) { console.error(`Solana log WebSocket ${this.host()} failed:`, error instanceof Error ? error.message : error); }
      this.endpointIndex = (this.endpointIndex + 1) % this.endpoints.length;
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async connect(): Promise<void> {
    const socket = new WebSocket(this.endpoints[this.endpointIndex]);
    this.socket = socket;
    socket.on('message', (raw) => { try { this.handle(JSON.parse(raw.toString()) as RpcMessage); } catch (error) { console.error('Invalid Solana log message:', error); } });
    socket.on('error', (error) => console.error('Solana log WebSocket error:', error.message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    for (const programId of this.handlers.keys()) await this.subscribe(programId);
    console.log(`Solana log WebSocket active on ${this.host()} (${this.handlers.size} programs).`);
    await new Promise<void>((resolve) => socket.once('close', resolve));
    this.socket = undefined;
  }

  private request(method: string, params: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 8_000);
      this.pending.set(id, (message) => { clearTimeout(timer); message.error ? reject(new Error(message.error.message ?? 'WebSocket request failed')) : resolve(message.result); });
      this.socket?.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  private async subscribe(programId: string): Promise<void> {
    const subscription = Number(await this.request('logsSubscribe', [{ mentions: [programId] }, { commitment: 'confirmed' }]));
    this.programsBySubscription.set(subscription, programId);
  }

  private handle(message: RpcMessage): void {
    if (message.id !== undefined) { this.pending.get(message.id)?.(message); this.pending.delete(message.id); return; }
    const value = message.params?.result?.value;
    const signature = value?.signature;
    const slot = message.params?.result?.context?.slot;
    const programId = message.params?.subscription === undefined ? undefined : this.programsBySubscription.get(message.params.subscription);
    if (message.method !== 'logsNotification' || !programId || !signature || slot === undefined || value.err || this.signatures.has(signature)) return;
    this.signatures.add(signature);
    this.handlers.get(programId)?.(signature, slot, value.logs ?? []);
  }

  private host(): string { try { return new URL(this.endpoints[this.endpointIndex]).host; } catch { return 'configured endpoint'; } }
}