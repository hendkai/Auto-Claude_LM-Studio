declare module 'xstate' {
  export function assign<TContext = unknown, TEvent = unknown>(assignment: unknown): any;
  export function createMachine<TContext = unknown, TEvent = unknown>(
    config: unknown,
    options?: unknown
  ): any;
  export function createActor(machine: any, options?: unknown): any;
  export type ActorRefFrom<T> = any;
}
