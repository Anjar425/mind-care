import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailTemplateRenderer } from './mail-template.renderer';

describe('MailTemplateRenderer', () => {
	const values = {
		firstName: 'Example',
		actionUrl: 'http://localhost:5173/auth/verify?token=abc',
		expiry: '15 minutes',
		year: '2026',
	};

	it.each(['verify-email', 'reset-password'] as const)(
		'should render the bundled %s template with every placeholder filled',
		(name) => {
			const html = new MailTemplateRenderer().render(name, values);
			expect(html).toContain('Hello Example,');
			expect(html).toContain(
				'href="http://localhost:5173/auth/verify?token=abc"',
			);
			expect(html).toContain('expire in 15 minutes.');
			expect(html).toContain('&copy; 2026 MindCare');
			expect(html).not.toMatch(/\{\{/);
		},
	);

	it('should escape injected markup in every value', () => {
		const html = new MailTemplateRenderer().render('verify-email', {
			...values,
			firstName: '<a href="https://evil.test">x</a>',
		});
		expect(html).toContain(
			'Hello &lt;a href=&quot;https://evil.test&quot;&gt;x&lt;/a&gt;,',
		);
		expect(html).not.toContain('<a href="https://evil.test">');
	});

	describe('with a custom template directory', () => {
		let directory: string;
		beforeEach(() => {
			directory = mkdtempSync(join(tmpdir(), 'mail-templates-'));
			writeFileSync(
				join(directory, 'verify-email.html'),
				'<p>{{ firstName }}</p>',
			);
		});
		afterEach(() => rmSync(directory, { recursive: true, force: true }));

		it('should reject a missing value', () => {
			expect(() =>
				new MailTemplateRenderer(directory).render('verify-email', {}),
			).toThrow('Mail template value missing: firstName');
		});

		it('should reject an unused value so typos are caught', () => {
			expect(() =>
				new MailTemplateRenderer(directory).render('verify-email', {
					firstName: 'A',
					extra: 'B',
				}),
			).toThrow('Mail template value unused: extra');
		});

		it('should report an unavailable template without leaking its path', () => {
			expect(() =>
				new MailTemplateRenderer(directory).render(
					'reset-password',
					{},
				),
			).toThrow(/^Mail template unavailable: reset-password$/);
		});

		it('should read each template from disk only once', () => {
			const renderer = new MailTemplateRenderer(directory);
			expect(renderer.render('verify-email', { firstName: 'A' })).toBe(
				'<p>A</p>',
			);
			writeFileSync(join(directory, 'verify-email.html'), 'changed');
			expect(renderer.render('verify-email', { firstName: 'B' })).toBe(
				'<p>B</p>',
			);
		});
	});
});
