import { Inject, Injectable, Optional } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from '../../shared/utils/html';

export type MailTemplateName = 'verify-email' | 'reset-password';

export const MAIL_TEMPLATE_DIRECTORY = Symbol('MAIL_TEMPLATE_DIRECTORY');

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

// Templates are copied next to this file by the Nest CLI asset step.
@Injectable()
export class MailTemplateRenderer {
	private readonly cache = new Map<MailTemplateName, string>();
	private readonly directory: string;

	constructor(
		@Optional() @Inject(MAIL_TEMPLATE_DIRECTORY) directory?: string,
	) {
		this.directory = directory ?? join(__dirname, 'templates');
	}

	// Every value is HTML-escaped; missing or unused values are rejected.
	render(
		name: MailTemplateName,
		values: Readonly<Record<string, string>>,
	): string {
		const template = this.load(name);
		const used = new Set<string>();
		const html = template.replace(PLACEHOLDER, (_, key: string) => {
			if (!Object.prototype.hasOwnProperty.call(values, key))
				throw new Error(`Mail template value missing: ${key}`);
			used.add(key);
			return escapeHtml(values[key]);
		});
		const unused = Object.keys(values).filter((key) => !used.has(key));
		if (unused.length)
			throw new Error(`Mail template value unused: ${unused.join(', ')}`);
		return html;
	}

	private load(name: MailTemplateName): string {
		const cached = this.cache.get(name);
		if (cached !== undefined) return cached;
		let template: string;
		try {
			template = readFileSync(
				join(this.directory, `${name}.html`),
				'utf8',
			);
		} catch {
			throw new Error(`Mail template unavailable: ${name}`);
		}
		this.cache.set(name, template);
		return template;
	}
}
