/**
 * Model Web Worker entry (1G spec §4.7, §11.2: Tier G and forecasts run off the main thread).
 * Hosts one ModelService; messages are { id, method, args } → { id, result } | { id, error }.
 * Create it through client.ts, never directly.
 */

import { ModelService } from './service.ts';
import { dispatch, type RpcRequest, type RpcResponse } from './rpc.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<RpcRequest>) => void) | null;
  postMessage: (m: RpcResponse) => void;
};

let service: ModelService | null = null;

scope.onmessage = (e) => {
  const { id, method, args } = e.data;
  try {
    if (method === 'init') {
      service = new ModelService(args[0] as ConstructorParameters<typeof ModelService>[0]);
      scope.postMessage({ id, result: service.state });
      return;
    }
    if (!service) throw new Error('model worker: init first');
    scope.postMessage({ id, result: dispatch(service, method, args) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
