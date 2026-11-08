import { SecurityEventService } from '../src/domain/security-events/security-event.service';

// Records nothing; feature tests assert on events through this mock when they need to.
export const securityEvents = {
	record: jest.fn().mockResolvedValue(undefined),
};
export const securityEventsProvider = {
	provide: SecurityEventService,
	useValue: securityEvents,
};
