import { ChainMain } from '@frankencoin/zchf';
import { ERC20Info } from './prices.types';
import { Address } from 'viem';
import { normalizeAddress } from 'utils/format';

export const ContractBlacklist: Address[] = [
	'0x5601b88A3F6700dd5cc9B94941431c6BfC077163',
	'0x691b4bAcBfE0e3bea191420e96ef41aA76729889',
	'0xCAf237F016CbA0E41b271E88e9088c09d495ee05',
	'0x372B2dC06478AA2c8182EeE0f12eA0e9A15E2913',
	'0xBA0D8F05700466d48A7464Ea27AA316875871A29',
	'0x64E0c986DfE96a8A22dfDFCDe1B08f953aC3Cb7d',
	'0xc040EaAA8187276278CAc428149e83Ce6271eFFF',
	'0xBD4DfC058eb95b8De5ceAF39966A1a70F5556F78',
].map((i) => normalizeAddress(i));

export const ContractWhitelist: ERC20Info[] = [
	{
		chainId: ChainMain.mainnet.id,
		address: '0x79d4f0232A66c4c91b89c76362016A1707CFBF4f',
		name: 'VNX Franc',
		symbol: 'VCHF',
		decimals: 18,
	},
	{
		chainId: ChainMain.mainnet.id,
		address: '0xBD4DfC058eb95b8De5ceAF39966A1a70F5556F78',
		name: 'AllUnity CHF',
		symbol: 'CHFAU',
		decimals: 6,
	},
];
