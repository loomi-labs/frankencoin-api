import { MinterQuery } from 'modules/ecosystem/ecosystem.minter.types';
import { escapeMd, formatCurrency, shortenString } from 'utils/format';
import { AppUrl, ExplorerTxUrl, getChain } from 'utils/func-helper';
import { ChainId } from '@frankencoin/zchf';
import { Chain } from 'viem';

export function MinterProposalVetoedMessage(minter: MinterQuery): string {
	const chain = getChain(minter.chainId as ChainId) as Chain;

	return `🚫 *Minter Proposal Vetoed*

🌐 Chain: *${chain?.name}* (${minter.chainId})
👤 Minter: \`${shortenString(minter.minter)}\`
👤 Suggestor: \`${shortenString(minter.suggestor)}\`
💰 Fee: *${formatCurrency(minter.applicationFee / 1e18, 2, 2)} ZCHF*
💬 Apply: ${escapeMd(minter.applyMessage || '—')}

🚫 Vetor: \`${shortenString(minter.vetor)}\`
💬 Reason: ${escapeMd(minter.denyMessage || '—')}

[🏛️ Governance](${AppUrl('/governance')}) · [🔍 Explorer](${ExplorerTxUrl(minter.denyTxHash, chain)})`;
}
