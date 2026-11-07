// Python float round uses the exact binary input and ties-to-even, unlike Math.round.
export function pythonRound(value: number, digits = 0): number {
	if (
		!Number.isFinite(value) ||
		!Number.isInteger(digits) ||
		digits < 0 ||
		digits > 8
	)
		throw new RangeError('Unsupported rounding input');
	if (value === 0) return value;
	const buffer = new ArrayBuffer(8),
		view = new DataView(buffer);
	view.setFloat64(0, Math.abs(value));
	const bits = view.getBigUint64(0),
		exponent = Number((bits >> 52n) & 2047n),
		fraction = bits & ((1n << 52n) - 1n);
	const significand = exponent === 0 ? fraction : (1n << 52n) | fraction;
	const power = (exponent === 0 ? -1022 : exponent - 1023) - 52;
	let numerator = significand * 10n ** BigInt(digits),
		denominator = 1n;
	if (power >= 0) numerator <<= BigInt(power);
	else denominator <<= BigInt(-power);
	let rounded = numerator / denominator;
	const remainder = numerator % denominator;
	if (
		remainder * 2n > denominator ||
		(remainder * 2n === denominator && rounded % 2n === 1n)
	)
		rounded++;
	return ((value < 0 ? -1 : 1) * Number(rounded)) / 10 ** digits;
}
