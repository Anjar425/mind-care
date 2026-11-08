import {
	BadRequestException,
	Injectable,
	type PipeTransform,
} from '@nestjs/common';

@Injectable()
export class PositiveIntIdPipe implements PipeTransform<string, number> {
	transform(value: string): number {
		const id = Number(value);
		if (
			!/^\d+$/.test(value) ||
			!Number.isSafeInteger(id) ||
			id < 1 ||
			id > 2147483647
		)
			throw new BadRequestException(
				'Rule, group and revision identifiers must be positive 32-bit integers',
			);
		return id;
	}
}
