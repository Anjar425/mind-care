import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	ObjectNotFoundError,
	type ObjectStore,
	type StoredObject,
} from './object-store';

const MAX_OBJECT_BYTES = 16 * 1024 * 1024;

// Duck-typed: Node's fs errors may come from another realm (e.g. a VM context), where
// `instanceof Error` is false.
function hasCode(error: unknown, code: string): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === code
	);
}

/**
 * Objects as files under `.private/<name>` (git-ignored, never served). Development, tests and
 * single-instance deployments only: other instances cannot see these files.
 */
export class LocalObjectStore implements ObjectStore {
	constructor(private readonly configuredRoot: string) {}

	async put(key: string, body: Buffer): Promise<void> {
		await fs.writeFile(await this.filename(key), body, {
			flag: 'wx',
			mode: 0o600,
		});
	}

	async replace(key: string, body: Buffer): Promise<void> {
		const target = await this.filename(key);
		await this.assertRegularFile(target);
		// Write beside, then rename: readers see the old or the new object, never a mix.
		const temporary = `${target}.${process.pid}.tmp`;
		await fs.writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
		await fs.rename(temporary, target);
	}

	async get(key: string): Promise<Buffer> {
		const filename = await this.filename(key);
		try {
			await this.assertRegularFile(filename);
		} catch (error) {
			if (hasCode(error, 'ENOENT')) throw new ObjectNotFoundError();
			throw error;
		}
		const handle = await fs.open(
			filename,
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		try {
			const info = await handle.stat();
			if (!info.isFile() || info.size > MAX_OBJECT_BYTES)
				throw new Error('Invalid object');
			return Buffer.from(
				await handle.readFile({ encoding: 'utf8' }),
				'utf8',
			);
		} finally {
			await handle.close();
		}
	}

	async delete(key: string): Promise<void> {
		const filename = await this.filename(key);
		try {
			await this.assertRegularFile(filename);
			await fs.unlink(filename);
		} catch (error) {
			if (hasCode(error, 'ENOENT')) return;
			throw error;
		}
	}

	async list(after: string, limit: number): Promise<StoredObject[]> {
		const root = await this.root();
		const names = (await fs.readdir(root, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name > after)
			.map((entry) => entry.name)
			.sort()
			.slice(0, limit);
		const result: StoredObject[] = [];
		for (const name of names) {
			const info = await fs.lstat(path.join(root, name));
			if (info.isFile() && !info.isSymbolicLink())
				result.push({
					key: name,
					lastModified: new Date(info.mtimeMs),
				});
		}
		return result;
	}

	private async assertRegularFile(filename: string): Promise<void> {
		const info = await fs.lstat(filename);
		if (!info.isFile() || info.isSymbolicLink())
			throw new Error('Unsafe object');
	}

	private async filename(key: string): Promise<string> {
		if (!/^[A-Za-z0-9._-]+$/.test(key) || key.startsWith('.'))
			throw new Error('Invalid object key');
		return path.join(await this.root(), key);
	}

	// Confined to the ignored .private directory; every ancestor must be a real directory.
	private async root(): Promise<string> {
		const base = path.resolve(process.cwd(), '.private');
		const root = path.resolve(process.cwd(), this.configuredRoot);
		if (!root.startsWith(base + path.sep))
			throw new Error('Invalid private storage configuration');
		let current = process.cwd();
		for (const segment of path
			.relative(process.cwd(), root)
			.split(path.sep)) {
			current = path.join(current, segment);
			try {
				await fs.mkdir(current, { mode: 0o700 });
			} catch (error) {
				if (!hasCode(error, 'EEXIST')) throw error;
			}
			const info = await fs.lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory())
				throw new Error('Unsafe private storage path');
		}
		return root;
	}
}
