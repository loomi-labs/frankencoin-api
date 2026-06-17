import { ERC20Info } from 'modules/prices/prices.types';
import { ADDRESS } from '@frankencoin/zchf';
import { mainnet } from 'viem/chains';

export const CHFAU_CONFIG: ERC20Info = {
	chainId: mainnet.id,
	address: ADDRESS[mainnet.id].chfauToken,
	name: 'AllUnity CHF',
	symbol: 'CHFAU',
	decimals: 6,
};
