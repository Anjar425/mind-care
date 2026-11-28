/**
 * A log-safe description of an unexpected server failure: the error class, a symbolic error code
 * when there is one, and the first application stack frame. It never includes the exception
 * message, data, URLs or request values, which may carry tokens, credentials or health data.
 *
 * Example: `Error at domain/identity/auth-session.service.js:164`
 */
const SYMBOLIC_CODE = /^[A-Z][A-Z0-9_]{1,40}$|^P\d{4}$/;
// `at fn (…/dist/x/y.js:12:3)` or `at …/src/x/y.ts:12:3`; dependency and Node frames are skipped.
const APP_FRAME =
	/^.*[\\/](?:dist|src)[\\/]([\w./\\-]+\.[cm]?[jt]s):(\d+):\d+\)?$/;

function className(error: object): string {
	const name = (error as { constructor?: { name?: unknown } }).constructor
		?.name;
	return typeof name === 'string' && /^\w{1,60}$/.test(name)
		? name
		: 'Object';
}

function appFrame(stack: unknown): string | undefined {
	if (typeof stack !== 'string') return undefined;
	for (const line of stack.split('\n').slice(1)) {
		const frame = line.trim();
		if (!frame.startsWith('at ') || frame.includes('node_modules'))
			continue;
		const match = APP_FRAME.exec(frame);
		if (match) return `${match[1].replace(/\\/g, '/')}:${match[2]}`;
	}
	return undefined;
}

export function failureKind(exception: unknown): string {
	if (exception === null || typeof exception !== 'object')
		return exception === null ? 'null' : typeof exception;
	const code = (exception as { code?: unknown }).code;
	const parts = [className(exception)];
	if (typeof code === 'string' && SYMBOLIC_CODE.test(code)) parts.push(code);
	const frame = appFrame((exception as { stack?: unknown }).stack);
	if (frame) parts.push(`at ${frame}`);
	return parts.join(' ');
}
