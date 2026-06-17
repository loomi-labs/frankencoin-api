import { PositionQuery } from 'modules/positions/positions.types';
import { escapeMd, formatCurrency, shortenString } from 'utils/format';
import { ExplorerAddressUrl } from 'utils/func-helper';
import { formatUnits } from 'viem';

export function PositionDeniedMessage(position: PositionQuery): string {
	const bal = formatUnits(BigInt(position.collateralBalance), position.collateralDecimals);
	const price = formatUnits(BigInt(position.price), 36 - position.collateralDecimals);
	const denied = position.denyDate > 0 ? new Date(position.denyDate * 1000).toUTCString() : 'Unknown';

	const sym = escapeMd(position.collateralSymbol);
	const name = escapeMd(position.collateralName);

	const auctionHours = Math.round(position.challengePeriod / 3600);
	const expiryDays = position.expiration > 0 ? Math.max(0, Math.round((position.expiration - Date.now() / 1000) / 86400)) : 0;

	return `🚫 *Position Denied*

📅 Denied: *${denied}*
🏦 Position: \`${shortenString(position.position)}\`
👤 Owner: \`${shortenString(position.owner)}\`

💎 Collateral: *${name} (${sym})*
   Address: \`${shortenString(position.collateral)}\`
   Balance: *${formatCurrency(bal, 2, 2)} ${sym}*
   Liq. Price: *${formatCurrency(price, 2, 2)} ZCHF*

📊 Limit: *${formatCurrency(formatUnits(BigInt(position.limitForClones), 18), 2, 2)} ZCHF*
   Interest: *${formatCurrency(position.annualInterestPPM / 10000, 1, 1)}%* APY
   Reserve: *${formatCurrency(position.reserveContribution / 10000, 1, 1)}%*
   Auction: *${auctionHours} hours*
   Expiry: *${expiryDays} days*

[🔍 Position](${ExplorerAddressUrl(position.position)}) · [🔍 Owner](${ExplorerAddressUrl(position.owner)}) · [🔍 Collateral](${ExplorerAddressUrl(position.collateral)})`;
}
