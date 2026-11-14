/** Message protocol between client.ts and worker.ts. */

import type { ModelService } from './service.ts';

export type ServiceMethod =
  | 'load'
  | 'beginAttempt'
  | 'append'
  | 'refresh'
  | 'endAttempt'
  | 'refit'
  | 'forecast'
  | 'testExtension'
  | 'adopt'
  | 'revoke'
  | 'report'
  | 'burns'
  | 'empirical'
  | 'state'
  | 'extensions'
  | 'adopted'
  | 'decisions';

export interface RpcRequest {
  readonly id: number;
  readonly method: ServiceMethod | 'init';
  readonly args: readonly unknown[];
}

export type RpcResponse =
  | { readonly id: number; readonly result: unknown }
  | { readonly id: number; readonly error: string };

/** Call a service method by name (also used in-thread, so both paths behave the same). */
export function dispatch(service: ModelService, method: string, args: readonly unknown[]): unknown {
  switch (method as ServiceMethod) {
    case 'state':
      return service.state;
    case 'extensions':
      return service.extensions;
    case 'adopted':
      return service.adopted;
    case 'decisions':
      return service.decisions;
    case 'load':
      return service.load(args[0] as Parameters<ModelService['load']>[0]);
    case 'beginAttempt':
      return service.beginAttempt(args[0] as Parameters<ModelService['beginAttempt']>[0]);
    case 'append':
      return service.append(args[0] as string, args[1] as Parameters<ModelService['append']>[1]);
    case 'refresh':
      return service.refresh();
    case 'endAttempt':
      return service.endAttempt(args[0] as Parameters<ModelService['endAttempt']>[0]);
    case 'refit':
      return service.refit();
    case 'forecast':
      return service.forecast(args[0] as Parameters<ModelService['forecast']>[0]);
    case 'testExtension':
      return service.testExtension(args[0] as string, args[1] as string[], args[2] as string);
    case 'adopt':
      return service.adopt(args[0] as string, args[1] as string | undefined);
    case 'revoke':
      return service.revoke(args[0] as string, args[1] as string | undefined);
    case 'report':
      return service.report();
    case 'burns':
      return service.burns(args[0] as string[] | undefined);
    case 'empirical':
      return service.empirical();
    default:
      throw new Error(`model: unknown method ${method}`);
  }
}
