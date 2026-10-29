// These synthetic values belong only to the test process, never a .env file.
process.env.JWT_ACCESS_SECRET = 'synthetic-access-key-for-auth-tests';
process.env.JWT_REFRESH_SECRET = 'synthetic-refresh-key-for-auth-tests';
process.env.VERIFICATION_TOKEN_EXPIRY_MINUTES = '15';
process.env.RESET_TOKEN_EXPIRY_MINUTES = '15';

jest.mock('@/prisma/prisma.service', () => ({
	PrismaService: class PrismaService {},
}));
jest.mock('@/mail/mail.service', () => ({ MailService: class MailService {} }));
jest.mock('dotenv/config', () => {
	throw new Error(
		'Environment-file loading is forbidden in isolated auth tests',
	);
});
