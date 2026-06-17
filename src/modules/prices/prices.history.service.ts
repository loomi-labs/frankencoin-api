import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PricesService } from './prices.service';
import { ERC20Info, PriceHistoryRatio, PriceQueryObjectArray } from './prices.types';
import { PriceHistoryQueryObjectArray } from '../../../exports';
import { PrismaService } from 'core/database/prisma.service';
import { Address } from 'viem';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PositionsService } from 'modules/positions/positions.service';
import { EcosystemFrankencoinService } from 'modules/ecosystem/ecosystem.frankencoin.service';
import { formatFloat, normalizeAddress, timestampStartOfDay } from 'utils/format';
import { EcosystemFpsService } from 'modules/ecosystem/ecosystem.fps.service';
import { VIEM_CONFIG } from 'app.config';
import { mainnet } from 'viem/chains';
import { ADDRESS, StablecoinBridgeV2ABI } from '@frankencoin/zchf';

@Injectable()
export class PricesHistoryService implements OnModuleInit {
	private readonly logger = new Logger(this.constructor.name);
	private fetchedHistory: PriceHistoryQueryObjectArray = {};
	private fetchedHistoryRatio: PriceHistoryRatio = {
		timestamp: 0,
		collateralRatioByFreeFloat: {},
		collateralRatioBySupply: {},
	};

	constructor(
		private readonly prisma: PrismaService,
		private readonly prices: PricesService,
		private readonly positions: PositionsService,
		private readonly frankencoin: EcosystemFrankencoinService,
		private readonly equity: EcosystemFpsService
	) {
		this.readBackupHistoryQuery();
		this.readBackupHistoryRatio();
	}

	onModuleInit() {
		this.prices.registerHistoryService(this);
	}

	async readBackupHistoryQuery() {
		if (!this.prisma.isEnabled()) {
			this.logger.warn('Database disabled, skipping price history restoration');
			return;
		}

		this.logger.log(`Reading backup price history from database`);

		try {
			// Read all price history rows
			const records = await this.prisma.priceHistory.findMany({
				orderBy: { timestamp: 'asc' },
			});

			if (records.length === 0) {
				this.logger.warn('No price history found in database');
				return;
			}

			// Transform from DB format to in-memory format
			// DB: { timestamp: xxx, prices: { address: price } }
			// Memory: { address: { history: { timestamp: price } } }
			const history: PriceHistoryQueryObjectArray = {};

			for (const record of records) {
				const timestamp = Number(record.timestamp);
				const prices = record.prices as { [address: string]: number };

				for (const [address, price] of Object.entries(prices)) {
					const addr = normalizeAddress(address);
					if (!history[addr]) {
						history[addr] = {
							address: addr,
							timestamp,
							price: { chf: price },
							history: {},
						} as any;
					}
					history[addr].history[timestamp] = price;
					history[addr].timestamp = Math.max(history[addr].timestamp, timestamp);
					history[addr].price.chf = price; // Keep latest price
				}
			}

			this.fetchedHistory = { ...this.fetchedHistory, ...history };
			this.logger.log(`Price history state restored from database (${records.length} timestamps)`);
		} catch (error) {
			this.logger.error('Failed to read price history from database', error);
		}
	}

	async readBackupHistoryRatio() {
		if (!this.prisma.isEnabled()) {
			this.logger.warn('Database disabled, skipping ratio history restoration');
			return;
		}

		this.logger.log(`Reading backup ratio history from database`);

		try {
			const records = await this.prisma.priceHistoryRatio.findMany({
				orderBy: { timestamp: 'asc' },
			});

			if (records.length === 0) {
				this.logger.warn('No ratio history found in database');
				return;
			}

			const collateralRatioByFreeFloat: { [timestamp: number]: number } = {};
			const collateralRatioBySupply: { [timestamp: number]: number } = {};
			let latestTimestamp = 0;

			for (const record of records) {
				const timestamp = Number(record.timestamp);
				collateralRatioByFreeFloat[timestamp] = record.collateralRatioByFreeFloat;
				collateralRatioBySupply[timestamp] = record.collateralRatioBySupply;
				latestTimestamp = Math.max(latestTimestamp, timestamp);
			}

			this.fetchedHistoryRatio = {
				timestamp: latestTimestamp,
				collateralRatioByFreeFloat,
				collateralRatioBySupply,
			};

			this.logger.log(`Ratio history state restored from database (${records.length} timestamps)`);
		} catch (error) {
			this.logger.error('Failed to read ratio history from database', error);
		}
	}

	async writeBackupHistoryQuery({ timestamp, mapping }: { timestamp: string; mapping: PriceHistoryQueryObjectArray }) {
		if (!this.prisma.isEnabled()) {
			return;
		}

		try {
			const prices: { [address: string]: number } = {};
			for (const [address, entry] of Object.entries(mapping)) {
				const price = entry.history[timestamp];
				if (price !== undefined) prices[address] = price;
			}

			await this.prisma.priceHistory.upsert({
				where: { timestamp: BigInt(timestamp) },
				create: { timestamp: BigInt(timestamp), prices },
				update: { prices },
			});

			this.logger.log(`Price history backup stored to database (timestamp: ${timestamp}, ${Object.keys(prices).length} entries)`);
		} catch (error) {
			this.logger.error('Failed to write price history to database', error);
		}
	}

	async writeBackupHistoryRatio({
		timestamp,
		collateralRatioByFreeFloat,
		collateralRatioBySupply,
	}: {
		timestamp: string;
		collateralRatioByFreeFloat: number;
		collateralRatioBySupply: number;
	}) {
		if (!this.prisma.isEnabled()) {
			return;
		}

		try {
			await this.prisma.priceHistoryRatio.upsert({
				where: { timestamp: BigInt(timestamp) },
				create: { timestamp: BigInt(timestamp), collateralRatioByFreeFloat, collateralRatioBySupply },
				update: { collateralRatioByFreeFloat, collateralRatioBySupply },
			});

			this.logger.log(`Ratio history backup stored to database (timestamp: ${timestamp})`);
		} catch (error) {
			this.logger.error('Failed to write ratio history to database', error);
		}
	}

	getHistory() {
		return this.fetchedHistory;
	}

	getHistoryByContract(contract: Address) {
		return this.fetchedHistory[normalizeAddress(contract)];
	}

	getRatio() {
		return this.fetchedHistoryRatio;
	}

	async fetchSources(prices: PriceQueryObjectArray, erc: ERC20Info): Promise<number | null> {
		const contract = normalizeAddress(erc.address);

		const data = prices[contract];
		if (data == undefined || data.timestamp == 0) {
			return null;
		}

		return data.price.chf;
	}

	@Cron(CronExpression.EVERY_HOUR)
	async updateHistory() {
		const timestamp = Number(timestampStartOfDay(Date.now()));
		await this.updateHistoryPrices({ timestamp });
		await this.updateHistoryRatio({ timestamp });
	}

	async updateHistoryPrices({ timestamp }: { timestamp: number }) {
		this.logger.debug('Updating History Prices');

		const pricesMapping = this.prices.getPricesMapping();
		const coll = Object.values(pricesMapping);

		if (!coll || coll.length == 0) return;

		const pricesQuery: PriceHistoryQueryObjectArray = {};
		let updatesCnt: number = 0;

		for (const erc of coll) {
			const addr = normalizeAddress(erc.address);
			const oldEntry = this.fetchedHistory[addr];

			if (!oldEntry) {
				this.logger.debug(`History for ${erc.name} not available, trying to fetch`);
				const price = await this.fetchSources(pricesMapping, erc);

				if (price != null) {
					updatesCnt += 1;
					pricesQuery[addr] = {
						...erc,
						timestamp,
						price: {
							chf: price,
						},
						history: {
							[timestamp]: price,
						},
					};
				}
			} else {
				// needs to update => try to fetch
				this.logger.debug(`History for ${erc.name} out of date, trying to fetch`);
				const price = await this.fetchSources(pricesMapping, erc);

				if (price != null) {
					updatesCnt += 1;
					pricesQuery[addr] = {
						...oldEntry,
						timestamp,
						price: {
							chf: price,
						},
						history: { ...oldEntry.history, [timestamp]: price },
					};
				}
			}
		}

		if (updatesCnt > 0) this.logger.log(`History merging, ${updatesCnt} entries.`);
		this.fetchedHistory = { ...this.fetchedHistory, ...pricesQuery };

		if (updatesCnt > 0) {
			await this.writeBackupHistoryQuery({ timestamp: String(timestamp), mapping: pricesQuery });
		}
	}

	async updateHistoryRatio({ timestamp }: { timestamp: number }) {
		this.logger.debug('Updating History Ratio');

		const supply = this.frankencoin.getEcosystemFrankencoinInfo().token.supply;
		const reserve = this.equity.getEcosystemFpsInfo().reserve.balance;
		const positions = Object.values(this.positions.getPositionsOpen().map);

		const positionData = positions.map((p) => {
			const key = normalizeAddress(p.collateral);
			return {
				minted: formatFloat(BigInt(p.minted), 18),
				marketPrice: this.fetchedHistory[key].price?.chf || 0,
				liqPrice: formatFloat(BigInt(p.price), 36 - p.collateralDecimals),
			};
		});

		const stablecoinBridgeCHFAU = normalizeAddress(ADDRESS[mainnet.id].stablecoinBridgeCHFAU);
		const stablecoinBridges = [
			{
				minted: formatFloat(
					await VIEM_CONFIG[mainnet.id].readContract({
						address: stablecoinBridgeCHFAU,
						abi: StablecoinBridgeV2ABI,
						functionName: 'minted',
					}),
					18
				),
				marketPrice: this.fetchedHistory[stablecoinBridgeCHFAU]?.price?.chf || 0,
				liqPrice: 1,
			},
		];

		const data = [...positionData, ...stablecoinBridges];

		const collMul = data.reduce((a, b) => {
			if (b.liqPrice == 0) return a;
			return a + (b.minted * b.marketPrice) / b.liqPrice;
		}, 0);

		const ratioBySupply = collMul / supply;
		const ratioByFreeFloat = collMul / (supply - reserve);

		this.fetchedHistoryRatio.timestamp = timestamp;
		this.fetchedHistoryRatio.collateralRatioBySupply = {
			...this.fetchedHistoryRatio.collateralRatioBySupply,
			[timestamp]: ratioBySupply,
		};
		this.fetchedHistoryRatio.collateralRatioByFreeFloat = {
			...this.fetchedHistoryRatio.collateralRatioByFreeFloat,
			[timestamp]: ratioByFreeFloat,
		};

		this.writeBackupHistoryRatio({
			timestamp: String(timestamp),
			collateralRatioByFreeFloat: ratioByFreeFloat,
			collateralRatioBySupply: ratioBySupply,
		});
	}
}
