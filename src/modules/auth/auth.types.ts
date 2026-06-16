export type SessionContext = 'dm' | 'group';

export type JwtPayload = {
	jti: string;
	iat: number;
	exp: number;
};

export type CreateTokenResponse = {
	token: string;
};

export type TokenStatusResponse = {
	linked: boolean;
};

export type AlertType =
	// position specific alerts
	| 'mintingUpdates'
	| 'positionExpiry'
	| 'priceAlerts'
	| 'challenge'
	// position whitelisting
	| 'allPositions'
	| 'position'
	| 'owner'
	| 'collateral'
	// various proposals
	| 'positionProposal'
	| 'minterProposal'
	| 'ccipProposal'
	| 'leadrateProposal'
	// general informations
	| 'weeklyInfo'
	| 'equityEvents';

export const NOTIFICATION_ALERT_TYPES: AlertType[] = [
	'mintingUpdates',
	'positionExpiry',
	'priceAlerts',
	'challenge',
	'allPositions',
	'positionProposal',
	'minterProposal',
	'ccipProposal',
	'leadrateProposal',
	'weeklyInfo',
	'equityEvents',
];

export type AlertDto = {
	type: AlertType;
	address?: string;
};

export type AlertResponse = {
	id: string;
	type: string;
	address: string;
	createdAt: Date;
};
