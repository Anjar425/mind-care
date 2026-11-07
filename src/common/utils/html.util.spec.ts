import { escapeHtml } from './html.util';

describe('escapeHtml', () => {
	it.each([
		['&', '&amp;'],
		['<', '&lt;'],
		['>', '&gt;'],
		['"', '&quot;'],
		["'", '&#39;'],
	])('should escape %s', (input, expected) => {
		expect(escapeHtml(input)).toBe(expected);
	});

	it('should neutralize a markup payload', () => {
		expect(escapeHtml('<a href="https://evil.test">x</a>')).toBe(
			'&lt;a href=&quot;https://evil.test&quot;&gt;x&lt;/a&gt;',
		);
	});

	it('should keep safe text and empty strings unchanged', () => {
		expect(escapeHtml('Siti Rahma, S.Psi.')).toBe('Siti Rahma, S.Psi.');
		expect(escapeHtml('')).toBe('');
	});

	it('should escape ampersands only once per pass', () => {
		expect(escapeHtml('&amp;')).toBe('&amp;amp;');
	});
});
