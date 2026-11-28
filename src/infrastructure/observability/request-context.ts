import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request facts that code without access to the HTTP request may need (audit, logs). */
export interface RequestContext {
	requestId: string;
	/** Client address as resolved by Express (honours TRUST_PROXY_HOPS). */
	ip?: string;
	userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
	run<T>(context: RequestContext, work: () => T): T {
		return storage.run(context, work);
	},
	/** Undefined outside an HTTP request (scheduled jobs, CLI). */
	current(): RequestContext | undefined {
		return storage.getStore();
	},
};
