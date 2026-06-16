import { LeadrateProposedQuery, LeadrateRateQuery } from 'modules/savings/savings.leadrate.types';
import { formatCurrency, shortenString } from 'utils/format';
import { AppUrl, ExplorerTxUrl, getChain } from 'utils/func-helper';
import { ChainId } from '@frankencoin/zchf';
import { Chain } from 'viem';

export function LeadrateProposalMessage(proposal: LeadrateProposedQuery, rates: LeadrateRateQuery[]): string {
	const chain = getChain(proposal.chainId as ChainId) as Chain;
	const deadline = new Date(proposal.nextChange * 1000);
	const currentRate = rates.find((r) => r.module === proposal.module)?.approvedRate;
	const isUnchanged = currentRate === proposal.nextRate;

	return `📊 *New Leadrate Proposal*

🌐 Chain: *${chain?.name}* (${proposal.chainId})
📋 Module: \`${shortenString(proposal.module)}\`
👤 Suggestor: \`${shortenString(proposal.proposer)}\`
⏰ Veto Until: *${deadline.toUTCString()}*
📈 Current Rate: *${formatCurrency(currentRate / 10000)}%*
📈 Proposed Rate: *${formatCurrency(proposal.nextRate / 10000)}%*

${isUnchanged ? '*Rate will remain unchanged*' : '*Rate can be applied after 7 days*'}

[🏛️ Governance](${AppUrl('/governance')}) · [🔍 Explorer](${ExplorerTxUrl(proposal.txHash, chain)})`;
}
