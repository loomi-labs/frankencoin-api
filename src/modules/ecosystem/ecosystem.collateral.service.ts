import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PositionsService } from 'modules/positions/positions.service';
import { PricesService } from 'modules/prices/prices.service';
import {
	ApiEcosystemCollateralList,
	ApiEcosystemCollateralListArray,
	ApiEcosystemCollateralPositions,
	ApiEcosystemCollateralPositionsDetails,
	ApiEcosystemCollateralStats,
	ApiEcosystemCollateralStatsItem,
} from './ecosystem.collateral.types';
import { PositionQuery } from 'modules/positions/positions.types';
import { Address, formatUnits } from 'viem';
import { normalizeAddress } from 'utils/format';
import { FIVEDAYS_MS } from 'utils/const-helper';
import { ERC20Info, PriceQueryCurrencies } from 'modules/prices/prices.types';
import { ADDRESS, ERC20ABI, StablecoinBridgeV2ABI } from '@frankencoin/zchf';
import { VIEM_CONFIG } from 'app.config';
import { mainnet } from 'viem/chains';
import { CHFAU_CONFIG } from './ecosystem.chfau.config';

const CHFAU_BRIDGE_ADDRESS = ADDRESS[mainnet.id].stablecoinBridgeCHFAU;

@Injectable()
export class EcosystemCollateralService {
	private readonly logger = new Logger(this.constructor.name);

	private chfauBridgeData: { minted: bigint; limit: bigint; collateralBalance: bigint } = {
		minted: 0n,
		limit: 0n,
		collateralBalance: 0n,
	};

	constructor(
		private readonly positionsService: PositionsService,
		private readonly pricesService: PricesService
	) {
		this.updateChfauBridgeData();
	}

	@Cron(CronExpression.EVERY_5_MINUTES)
	async updateChfauBridgeData() {
		try {
			const client = VIEM_CONFIG[mainnet.id];
			const [minted, limit, collateralBalance] = await Promise.all([
				client.readContract({ address: CHFAU_BRIDGE_ADDRESS, abi: StablecoinBridgeV2ABI, functionName: 'minted' }),
				client.readContract({ address: CHFAU_BRIDGE_ADDRESS, abi: StablecoinBridgeV2ABI, functionName: 'limit' }),
				client.readContract({
					address: CHFAU_CONFIG.address,
					abi: ERC20ABI,
					functionName: 'balanceOf',
					args: [CHFAU_BRIDGE_ADDRESS],
				}),
			]);
			this.chfauBridgeData = { minted: minted as bigint, limit: limit as bigint, collateralBalance: collateralBalance as bigint };
		} catch (e) {
			this.logger.error(`Failed to update CHFAU bridge data: ${e}`);
		}
	}

	getCollateralList(): ApiEcosystemCollateralListArray {
		const c = this.pricesService.getCollateral();
		return {
			num: Object.keys(c).length,
			list: Object.values(c) as ERC20Info[],
		};
	}

	getCollateralMapping(): ApiEcosystemCollateralList {
		const c = this.pricesService.getCollateral();
		return {
			num: Object.keys(c).length,
			addresses: Object.keys(c) as Address[],
			map: c,
		};
	}

	getCollateralPositions(): ApiEcosystemCollateralPositions {
		const positions = Object.values(this.positionsService.getPositionsList().list);
		const collaterals = this.pricesService.getCollateral();
		const collateralPositions: ApiEcosystemCollateralPositions = {};

		for (const c of Object.values(collaterals)) {
			const matchedPositions = positions.filter((p: PositionQuery) => p.collateral === c.address);
			const addresses: Address[] = matchedPositions.map((p: PositionQuery) => p.position);
			collateralPositions[normalizeAddress(c.address)] = {
				...c,
				num: addresses.length,
				addresses: addresses,
			};
		}

		return collateralPositions;
	}

	getCollateralPositionsDetails(): ApiEcosystemCollateralPositionsDetails {
		const positions = Object.values(this.positionsService.getPositionsOpen().map);
		const collaterals = this.pricesService.getCollateral();
		const collateralPositions: ApiEcosystemCollateralPositionsDetails = {};

		for (const c of Object.values(collaterals)) {
			const matchedPositions = positions.filter((p: PositionQuery) => p.collateral === c.address);
			const addresses: Address[] = matchedPositions.map((p: PositionQuery) => p.position);
			collateralPositions[normalizeAddress(c.address)] = {
				...c,
				num: addresses.length,
				addresses: addresses,
				positions: matchedPositions,
			};
		}

		return collateralPositions;
	}

	getCollateralStats(): ApiEcosystemCollateralStats {
		const collateralPositionsDetails = this.getCollateralPositionsDetails();
		const prices = this.pricesService.getPricesMapping();

		const zchfAddress = this.pricesService.getMint()?.address;
		if (!zchfAddress) return null;
		const zchfPrice = prices[normalizeAddress(zchfAddress)]?.price?.usd as number;
		if (!zchfPrice) return null;

		const ecosystemTotalValueLocked: PriceQueryCurrencies = {};
		const map: { [key: Address]: ApiEcosystemCollateralStatsItem } = {};

		// Pre-compute totalLimit per collateral in one pass over all positions
		const nowSec = Date.now() / 1000;
		const totalLimitByCollateral: Record<string, bigint> = {};
		for (const p of this.positionsService.getPositionsList().list) {
			if (!p.isOriginal || p.expiration <= nowSec) continue;
			const key = normalizeAddress(p.collateral);
			totalLimitByCollateral[key] = (totalLimitByCollateral[key] ?? 0n) + BigInt(p.limitForClones);
		}

		for (const c of Object.values(collateralPositionsDetails)) {
			const price = prices[normalizeAddress(c.address)]?.price?.usd as number;
			if (!price) continue;

			// Single pass over positions — replaces 7 separate filter/reduce calls
			const nowMs = Date.now();
			let open = 0,
				closed = 0,
				denied = 0,
				requested = 0,
				originals = 0,
				clones = 0;
			let totalMinted = 0n,
				totalBalance = 0n;
			for (const p of c.positions as PositionQuery[]) {
				if (p.closed) {
					closed++;
				} else if (p.denied) {
					denied++;
				} else {
					open++;
					totalMinted += BigInt(p.minted);
					if (p.start * 1000 + FIVEDAYS_MS > nowMs) requested++;
				}
				if (p.isOriginal) {
					originals++;
				} else {
					clones++;
				}
				totalBalance += BigInt(p.collateralBalance);
			}
			const total = c.positions.length;
			const totalLimit = totalLimitByCollateral[normalizeAddress(c.address)] ?? 0n;
			const totalBalanceNumUsd = parseInt(formatUnits(totalBalance, c.decimals)) * price;
			const totalValueLocked: PriceQueryCurrencies = {
				usd: totalBalanceNumUsd,
				chf: totalBalanceNumUsd / zchfPrice,
			};

			// upsert ecosystemTotalValueLocked usd
			if (!ecosystemTotalValueLocked.usd) {
				ecosystemTotalValueLocked.usd = totalValueLocked.usd;
			} else {
				ecosystemTotalValueLocked.usd += totalValueLocked.usd;
			}

			// upsert ecosystemTotalValueLocked chf
			if (!ecosystemTotalValueLocked.chf) {
				ecosystemTotalValueLocked.chf = totalValueLocked.chf;
			} else {
				ecosystemTotalValueLocked.chf += totalValueLocked.chf;
			}

			// upsert map
			map[normalizeAddress(c.address)] = {
				chainId: c.chainId,
				address: c.address,
				name: c.name,
				symbol: c.symbol,
				decimals: c.decimals,
				positions: {
					total,
					open,
					requested,
					closed,
					denied,
					originals,
					clones,
				},
				totalMinted: parseInt(formatUnits(totalMinted, 18)),
				totalLimit: parseInt(formatUnits(totalLimit, 18)),
				totalBalanceRaw: totalBalance.toString(),
				totalValueLocked,
				price: {
					usd: price,
					chf: Math.round((price / zchfPrice) * 100) / 100,
				},
			};
		}

		// Inject CHFAU bridge as a synthetic collateral entry
		const chfauKey = normalizeAddress(CHFAU_CONFIG.address);
		const chfauPrice = prices[chfauKey]?.price?.usd as number;
		if (chfauPrice && this.chfauBridgeData.limit > 0n) {
			const { minted, limit, collateralBalance } = this.chfauBridgeData;
			const chfauBalanceNumUsd = parseInt(formatUnits(collateralBalance, CHFAU_CONFIG.decimals)) * chfauPrice;
			const chfauTvl: PriceQueryCurrencies = {
				usd: chfauBalanceNumUsd,
				chf: chfauBalanceNumUsd / zchfPrice,
			};

			ecosystemTotalValueLocked.usd = (ecosystemTotalValueLocked.usd ?? 0) + chfauTvl.usd;
			ecosystemTotalValueLocked.chf = (ecosystemTotalValueLocked.chf ?? 0) + chfauTvl.chf;

			map[chfauKey] = {
				chainId: CHFAU_CONFIG.chainId,
				address: CHFAU_CONFIG.address,
				name: CHFAU_CONFIG.name,
				symbol: CHFAU_CONFIG.symbol,
				decimals: CHFAU_CONFIG.decimals,
				positions: { total: 1, open: 1, requested: 0, closed: 0, denied: 0, originals: 1, clones: 0 },
				totalMinted: parseInt(formatUnits(minted, 18)),
				totalLimit: parseInt(formatUnits(limit, 18)),
				totalBalanceRaw: collateralBalance.toString(),
				totalValueLocked: chfauTvl,
				price: {
					usd: chfauPrice,
					chf: Math.round((chfauPrice / zchfPrice) * 100) / 100,
				},
			};
		}

		const allAddresses = Object.keys(map) as Address[];
		return {
			num: allAddresses.length,
			addresses: allAddresses,
			totalValueLocked: ecosystemTotalValueLocked,
			map,
		};
	}
}
