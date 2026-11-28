import { JwtService } from '@nestjs/jwt';
import { AuthSessionService } from '../../src/domain/identity/auth-session.service';
import { AuthService } from '../../src/domain/identity/auth.service';
import { UserService } from '../../src/domain/identity/user.service';
import { SecurityEventService } from '../../src/domain/security-events/security-event.service';
import type { MailService } from '../../src/infrastructure/mail/mail.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { UserRole } from '../../src/shared/types/role';
import { createPrisma, createUser, dbConfig, resetData } from './support';

// API-001: sign-up never answers differently for registered emails, including under races.
describe('Registration without account disclosure on PostgreSQL', () => {
	const config = dbConfig();
	const password = 'Passw0rd123';
	let prisma: PrismaService;
	let users: UserService;
	let auth: AuthService;
	const mail = {
		sendVerificationEmail: jest.fn(),
		sendPasswordResetEmail: jest.fn(),
		sendAccountExistsEmail: jest.fn(),
	};
	// Emails are sent after the response; wait until one went out (or give up).
	const sent = async (mock: jest.Mock, timeoutMs = 5000) => {
		const deadline = Date.now() + timeoutMs;
		while (!mock.mock.calls.length && Date.now() < deadline)
			await new Promise((done) => setTimeout(done, 20));
	};

	beforeAll(() => {
		prisma = createPrisma();
		const events = new SecurityEventService(prisma, config);
		users = new UserService(prisma);
		auth = new AuthService(
			prisma,
			users,
			new AuthSessionService(prisma, new JwtService({}), config, events),
			mail as unknown as MailService,
			config,
			events,
		);
	});
	beforeEach(async () => {
		jest.clearAllMocks();
		await resetData(prisma);
	});
	afterAll(async () => {
		await prisma.$disconnect();
	});

	it('R1: concurrent sign-ups of one new email create one account and all end at it', async () => {
		const variants = [
			'race@example.test',
			'RACE@example.test',
			' Race@Example.test ',
			'race@EXAMPLE.test',
			'race@example.test',
		];
		const outcomes = await Promise.all(
			variants.map((email) =>
				users.register({
					name: 'Racer',
					email,
					password,
					role: UserRole.USER,
				}),
			),
		);
		expect(outcomes.filter((o) => o.created)).toHaveLength(1);
		expect(new Set(outcomes.map((o) => o.account.id)).size).toBe(1);
		expect(
			await prisma.user.count({ where: { email: 'race@example.test' } }),
		).toBe(1);
	});

	it('R2: a verified email resolves without a conflict, keeps the account unchanged and notifies its owner', async () => {
		const owner = await createUser(prisma, { name: 'Owner' });
		await expect(
			auth.register(
				{
					name: 'Someone Else',
					email: owner.email.toUpperCase(),
					password,
					confirm_password: password,
				},
				UserRole.EXPERT,
			),
		).resolves.toBeUndefined();
		await sent(mail.sendAccountExistsEmail);
		const after = await prisma.user.findUniqueOrThrow({
			where: { id: owner.id },
		});
		expect(after).toMatchObject({
			password: owner.password,
			role: 'USER',
			name: 'Owner',
		});
		expect(await prisma.user.count()).toBe(1);
		expect(mail.sendAccountExistsEmail).toHaveBeenCalledWith(
			owner.email,
			'Owner',
		);
		expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
	});

	it('R3: an unverified email gets a fresh verification token instead of a notice', async () => {
		const pending = await createUser(prisma, {
			name: 'Pending',
			verified: false,
		});
		await auth.register(
			{
				name: 'Pending',
				email: pending.email,
				password,
				confirm_password: password,
			},
			UserRole.USER,
		);
		await sent(mail.sendVerificationEmail);
		expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
			pending.email,
			expect.stringMatching(/^[a-f0-9]{64}$/),
			'Pending',
		);
		expect(
			await prisma.emailVerificationToken.count({
				where: { userId: pending.id, usedAt: null },
			}),
		).toBe(1);
		expect(mail.sendAccountExistsEmail).not.toHaveBeenCalled();
	});
});
