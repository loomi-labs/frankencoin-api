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

export type AlertType = 'position' | 'owner' | 'collateral';

export type AlertDto = {
	type: AlertType;
	address: string;
};

export type AlertResponse = {
	id: string;
	type: string;
	address: string;
	createdAt: Date;
};
