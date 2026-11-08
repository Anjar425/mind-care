import {
	getReferenceSeedBundle,
	getReferenceSeedManifest,
} from './reference-seed.plan';
import { DASS21_CATALOG } from './catalogs/dass21.catalog';

describe('Reference seed content', () => {
	it('should provide only reference data when preparing the seed bundle', () => {
		const bundle = getReferenceSeedBundle();
		expect(Object.keys(bundle).sort()).toEqual([
			'catalogDigest',
			'catalogVersion',
			'conclusions',
			'dass21',
			'dass42',
		]);
		expect(bundle.dass21).toHaveLength(21);
		expect(bundle.dass42).toHaveLength(42);
		expect(bundle.conclusions).toHaveLength(15);
		expect(bundle.dass21[0].text).toBe(DASS21_CATALOG.questions[0].text);
		expect(bundle.conclusions.every((pair) => !('id' in pair))).toBe(true);
	});
	it('should produce a stable digest when the approved candidate is unchanged', () => {
		expect(getReferenceSeedBundle().catalogDigest).toMatch(
			/^[a-f0-9]{64}$/,
		);
		expect(getReferenceSeedBundle().catalogDigest).toBe(
			getReferenceSeedBundle().catalogDigest,
		);
	});
	it('should keep the release immutable when a caller modifies a prepared seed row', () => {
		getReferenceSeedBundle().dass21[0].text = 'changed';
		expect(getReferenceSeedBundle().dass21[0].text).toBe(
			DASS21_CATALOG.questions[0].text,
		);
	});
	it('should identify its offline preview honestly when storage has not been checked', () => {
		const manifest = getReferenceSeedManifest();
		expect(manifest.storageChecked).toBe(false);
		expect(manifest.clinicalReviewStatus).toBe('unreviewed');
		expect(manifest.licenseStatus).toBe('unverified');
	});
});
