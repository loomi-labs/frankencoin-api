// @dev: timestamps of last trigger emits
export type TelegramState = {
	minterApplied: number;
	minterVetoed: number;
	leadrateProposal: number;
	leadrateChanged: number;
	positions: number;
	positionsDenied: number;
	positionsExpiringSoon1: number;
	positionsExpiringSoon7: number;
	positionsExpired: number;
	positionsPriceAlert: Map<string, PositionPriceAlertState>;
	mintingUpdates: number;
	challenges: number;
	bids: number;
	equityInvested: number;
	equityRedeemed: number;
	ccipProposalNew: number;
	ccipProposalDenied: number;
	ccipProposalEnacted: number;
	ccipRateLimit: number;
};

export type PositionPriceAlertState = { alertTimestamp: number; warningTimestamp: number; lowestTimestamp: number; lowestPrice: number };
