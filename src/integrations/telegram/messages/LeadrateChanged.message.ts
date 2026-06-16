import { LeadrateRateQuery } from 'modules/savings/savings.leadrate.types';
import { formatCurrency, shortenString } from 'utils/format';
import { AppUrl, ExplorerTxUrl, getChain } from 'utils/func-helper';
import { ChainId } from '@frankencoin/zchf';
import { Chain } from 'viem';

export function LeadrateChangedMessage(rate: LeadrateRateQuery): string {
	const chain = getChain(rate.chainId as ChainId) as Chain;
	const d = new Date(rate.created * 1000);

	return `✅ *Savings Rate Updated*

🌐 Chain: *${chain?.name}* (${rate.chainId})
📋 Module: \`${shortenString(rate.module)}\`
📅 Valid From: *${d.toUTCString()}*
📈 New Rate: *${formatCurrency(rate.approvedRate / 10_000)}%*

[🏛️ Governance](${AppUrl('/governance')}) · [🔍 Explorer](${ExplorerTxUrl(rate.txHash, chain)})`;
}
