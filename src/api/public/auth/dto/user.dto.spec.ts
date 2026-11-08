import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterReqDto } from '@/api/public/auth/dto/req/register.req.dto';
import { ACCOUNT_NAME_PATTERN } from './user.dto';

const password = 'Passw0rd123';

async function nameErrors(name: unknown): Promise<string[]> {
	const dto = plainToInstance(RegisterReqDto, {
		name,
		email: 'user@example.com',
		password,
		confirm_password: password,
	});
	const errors = await validate(dto);
	return errors
		.filter((error) => error.property === 'name')
		.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UserDto account name', () => {
	it.each([
		'Example',
		'Siti Rahma, S.Psi., M.Psi.',
		"O'Brien",
		'Anne-Marie',
		'Rëné Ñúñez',
		'Ahmad 2nd',
	])('should accept %p', async (name) => {
		expect(await nameErrors(name)).toEqual([]);
	});

	it.each([
		'<b>Example</b>',
		'<a href="https://evil.test">x</a>',
		'Tom & Jerry',
		'Ex"ample',
		'Ex`ample',
		'back\\slash',
		'slash/name',
		'zero​width',
		'line\nbreak',
		'1234',
		'.,-',
	])('should reject %p', async (name) => {
		expect(await nameErrors(name)).toContain(
			'name contains unsupported characters',
		);
	});

	it('should use a Unicode-aware pattern', () => {
		expect(ACCOUNT_NAME_PATTERN.flags).toContain('u');
	});
});
