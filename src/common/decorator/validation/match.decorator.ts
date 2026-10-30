import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';

export function Match(property: string, validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'Match',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			constraints: [property],
			validator: {
				validate(value: unknown, args: ValidationArguments) {
					const [relatedProperty] = args.constraints;
					const relatedValue = (
						args.object as Record<string, unknown>
					)[relatedProperty];
					return value === relatedValue;
				},
				defaultMessage(args: ValidationArguments) {
					const [relatedProperty] = args.constraints;
					return `${args.property} must match ${relatedProperty}`;
				},
			},
		});
	};
}
