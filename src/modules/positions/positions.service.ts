import { Injectable, Logger } from '@nestjs/common';
import { PONDER_CLIENT, PONDER_CLIENT_BACKUP, VIEM_CONFIG } from 'app.config';
import { gql } from '@apollo/client/core';
import { DataSourceManagerService } from 'core/data-source/data-source.manager.service';
import {
	ApiMintingUpdateListing,
	ApiMintingUpdateMapping,
	ApiOwnerDebt,
	ApiOwnerHistory,
	ApiOwnerTransfersListing,
	ApiPositionsListing,
	ApiPositionsMapping,
	ApiPositionsOwners,
	MintingUpdateQuery,
	MintingUpdateQueryObjectArray,
	MintingUpdateQueryV1,
	MintingUpdateQueryV2,
	OwnersPositionsObjectArray,
	OwnerTransferQuery,
	PositionQuery,
	PositionQueryV1,
	PositionQueryV2,
	PositionsQueryObjectArray,
} from './positions.types';
import { Address, erc20Abi, getAddress } from 'viem';
import { FIVEDAYS_MS } from 'utils/const-helper';
import { PositionV1ABI } from '@frankencoin/zchf';
import { ADDRESS } from '@frankencoin/zchf';
import { SavingsABI } from '@frankencoin/zchf';
import { PositionV2ABI } from '@frankencoin/zchf';
import { mainnet } from 'viem/chains';
import { normalizeAddress } from 'utils/format';

@Injectable()
export class PositionsService {
	private readonly logger = new Logger(this.constructor.name);
	private fetchedPositionV1s: PositionQueryV1[] = [];
	private fetchedPositionV2s: PositionQueryV2[] = [];
	private fetchedPositions: PositionsQueryObjectArray = {};
	private fetchedMintingUpdates: MintingUpdateQueryObjectArray = {};

	constructor(private readonly dataSource: DataSourceManagerService) {}

	getPositionsList(): ApiPositionsListing {
		const pos = Object.values(this.fetchedPositions) as PositionQuery[];
		return {
			num: pos.length,
			list: pos,
		};
	}

	getPositionsMapping(): ApiPositionsMapping {
		const pos = this.fetchedPositions;
		return { num: Object.keys(pos).length, addresses: Object.keys(pos) as Address[], map: pos };
	}

	getPositionsOpen(): ApiPositionsMapping {
		const pos = this.getPositionsList().list;
		const open = pos.filter((p) => !p.closed && !p.denied && BigInt(p.collateralBalance) > 0n);
		const mapped: PositionsQueryObjectArray = {};
		for (const p of open) {
			mapped[p.position] = p;
		}
		return { num: Object.keys(mapped).length, addresses: Object.keys(mapped) as Address[], map: mapped };
	}

	getPositionsRequests(): ApiPositionsMapping {
		const pos = this.getPositionsList().list;
		// @dev: includes 5days created positions
		const request = pos.filter((p) => p.start * 1000 + FIVEDAYS_MS > Date.now());
		const mapped: PositionsQueryObjectArray = {};
		for (const p of request) {
			mapped[p.position] = p;
		}
		return { num: Object.keys(mapped).length, addresses: Object.keys(mapped) as Address[], map: mapped };
	}

	getPositionsDenied(): ApiPositionsMapping {
		const pos = this.getPositionsList().list;
		// @dev: includes positions denied within the last 5 days
		const denied = pos.filter((p) => p.denyDate > 0 && p.denyDate * 1000 + FIVEDAYS_MS > Date.now());
		const mapped: PositionsQueryObjectArray = {};
		for (const p of denied) {
			mapped[p.position] = p;
		}
		return { num: Object.keys(mapped).length, addresses: Object.keys(mapped) as Address[], map: mapped };
	}

	getPositionsOwners(): ApiPositionsOwners {
		const ow: OwnersPositionsObjectArray = {};
		for (const p of Object.values(this.fetchedPositions)) {
			const owner = normalizeAddress(p.owner);
			if (!ow[owner]) ow[owner] = [];
			ow[owner].push(p);
		}
		return {
			num: Object.keys(ow).length,
			owners: Object.keys(ow) as Address[],
			map: ow,
		};
	}

	async updatePositonV1s() {
		this.logger.debug('Updating Positions V1');
		const currentSource = this.dataSource.getCurrentSource();

		// Determine which client to use
		const client = currentSource === 'primary' ? PONDER_CLIENT : PONDER_CLIENT_BACKUP;

		try {
			const { data } = await client!.query<{
				mintingHubV1PositionV1s: {
					items: PositionQueryV1[];
				};
			}>({
				fetchPolicy: 'no-cache',
				query: gql`
					query {
						mintingHubV1PositionV1s(orderBy: "created", orderDirection: "desc", limit: 1000) {
							items {
								position
								owner
								zchf
								collateral
								price

								created
								isOriginal
								isClone
								denied
								denyDate
								closed
								original

								minimumCollateral
								annualInterestPPM
								reserveContribution
								start
								cooldown
								expiration
								challengePeriod

								zchfName
								zchfSymbol
								zchfDecimals

								collateralName
								collateralSymbol
								collateralDecimals
								collateralBalance

								limitForPosition
								limitForClones
								availableForPosition
								availableForClones
								minted
							}
						}
					}
				`,
			});

			if (!data || !data?.mintingHubV1PositionV1s?.items?.length) {
				this.logger.warn('No Positions V1 found.');
				return;
			}

			const items: PositionQuery[] = data.mintingHubV1PositionV1s.items as PositionQueryV1[];
			const list: PositionsQueryObjectArray = {};
			const balanceOfDataPromises: Promise<bigint>[] = [];
			const mintedDataPromises: Promise<bigint>[] = [];
			const availableForClonesDataPromises: Promise<bigint>[] = [];

			// Ponder same-batch factory child event miss: when a position is opened and then acted on
			// (e.g. denied) within the same ethGetLogsBlockRange window, Ponder silently drops the child
			// contract events during a full re-index. Position 0xf35378277191c1f0d90869426f7177aa0393f77d
			// was opened at block 25287288 and denied at block 25287602 — both inside window [25286536–25291535]
			// — so after re-indexing it incorrectly shows denied: false. Filter it out until ponder is fixed
			// or the indexer is backfilled. See: ponder/docs/ponder-factory-same-batch-miss.md
			const PONDER_SAME_BATCH_MISS = new Set(['0xf35378277191c1f0d90869426f7177aa0393f77d']);
			const filteredItems = items.filter((p) => !PONDER_SAME_BATCH_MISS.has(normalizeAddress(p.position)));
			const openItems = filteredItems.filter((p) => !p.closed && !p.denied) as PositionQueryV1[];
			const closedItems = filteredItems.filter((p) => p.closed || p.denied) as PositionQueryV1[];

			for (const p of openItems) {
				// Forces the collateral balance to be overwritten with the latest blockchain state, instead of the ponder state.
				// This ensures that collateral transfers can be made without using the smart contract or application directly,
				// and the API will be aware of the updated state.
				balanceOfDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.collateral,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [p.position],
					})
				);

				// fetch minted - See issue #11
				// https://github.com/Frankencoin-ZCHF/frankencoin-api/issues/11
				mintedDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.position,
						abi: PositionV1ABI,
						functionName: 'minted',
					})
				);

				availableForClonesDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.position,
						abi: PositionV1ABI,
						functionName: 'limitForClones',
					})
				);
			}

			// await for contract calls
			const balanceOfData = await Promise.allSettled(balanceOfDataPromises);
			const mintedData = await Promise.allSettled(mintedDataPromises);
			const availableForClonesData = await Promise.allSettled(availableForClonesDataPromises);

			for (let idx = 0; idx < openItems.length; idx++) {
				const p = openItems[idx];
				const b = (balanceOfData[idx] as PromiseFulfilledResult<bigint>).value;
				const m = (mintedData[idx] as PromiseFulfilledResult<bigint>).value;
				const a = (availableForClonesData[idx] as PromiseFulfilledResult<bigint>).value;

				const entry: PositionQueryV1 = {
					version: 1,

					position: getAddress(p.position),
					owner: getAddress(p.owner),
					zchf: getAddress(p.zchf),
					collateral: getAddress(p.collateral),
					price: p.price,

					created: parseInt(p.created as any),
					isOriginal: p.isOriginal,
					isClone: p.isClone,
					denied: p.denied,
					denyDate: parseInt(p.denyDate as any),
					closed: p.closed,
					original: getAddress(p.original),

					minimumCollateral: p.minimumCollateral,
					annualInterestPPM: p.annualInterestPPM,
					reserveContribution: p.reserveContribution,
					start: parseInt(p.start as any),
					cooldown: parseInt(p.cooldown as any),
					expiration: parseInt(p.expiration as any),
					challengePeriod: parseInt(p.challengePeriod as any),

					zchfName: p.zchfName,
					zchfSymbol: p.zchfSymbol,
					zchfDecimals: p.zchfDecimals,

					collateralName: p.collateralName,
					collateralSymbol: p.collateralSymbol,
					collateralDecimals: p.collateralDecimals,
					collateralBalance: typeof b === 'bigint' ? b.toString() : p.collateralBalance,

					limitForPosition: p.limitForPosition,
					limitForClones: p.limitForClones,
					availableForPosition: p.availableForPosition,
					availableForClones: typeof a === 'bigint' ? a.toString() : p.availableForClones,
					minted: typeof m === 'bigint' ? m.toString() : p.minted,
				};

				list[normalizeAddress(p.position)] = entry;
			}

			for (const p of closedItems) {
				list[normalizeAddress(p.position)] = {
					version: 1,

					position: getAddress(p.position),
					owner: getAddress(p.owner),
					zchf: getAddress(p.zchf),
					collateral: getAddress(p.collateral),
					price: p.price,

					created: parseInt(p.created as any),
					isOriginal: p.isOriginal,
					isClone: p.isClone,
					denied: p.denied,
					denyDate: parseInt(p.denyDate as any),
					closed: p.closed,
					original: getAddress(p.original),

					minimumCollateral: p.minimumCollateral,
					annualInterestPPM: p.annualInterestPPM,
					reserveContribution: p.reserveContribution,
					start: parseInt(p.start as any),
					cooldown: parseInt(p.cooldown as any),
					expiration: parseInt(p.expiration as any),
					challengePeriod: parseInt(p.challengePeriod as any),

					zchfName: p.zchfName,
					zchfSymbol: p.zchfSymbol,
					zchfDecimals: p.zchfDecimals,

					collateralName: p.collateralName,
					collateralSymbol: p.collateralSymbol,
					collateralDecimals: p.collateralDecimals,
					collateralBalance: p.collateralBalance,

					limitForPosition: p.limitForPosition,
					limitForClones: p.limitForClones,
					availableForPosition: p.availableForPosition,
					availableForClones: p.availableForClones,
					minted: p.minted,
				};
			}

			const a = Object.keys(list).length;
			const b = this.fetchedPositionV1s.length;
			const isDiff = a > b;

			if (isDiff) this.logger.log(`Positions V1 merging, from ${b} to ${a} positions`);
			this.fetchedPositionV1s = Object.values(list) as PositionQueryV1[];
			this.fetchedPositions = { ...this.fetchedPositions, ...list };

			return list;
		} catch (error) {
			this.logger.error('Failed to update Positions V1 from indexer', error);
			// Data remains in memory from previous successful fetch
		}
	}

	async updatePositonV2s() {
		this.logger.debug('Updating Positions V2');
		const currentSource = this.dataSource.getCurrentSource();

		// Determine which client to use
		const client = currentSource === 'primary' ? PONDER_CLIENT : PONDER_CLIENT_BACKUP;

		try {
			const { data } = await client!.query<{
				mintingHubV2PositionV2s: {
					items: PositionQueryV2[];
				};
			}>({
				fetchPolicy: 'no-cache',
				query: gql`
					query {
						mintingHubV2PositionV2s(orderBy: "created", orderDirection: "desc", limit: 1000) {
							items {
								position
								owner
								zchf
								collateral
								price

								created
								isOriginal
								isClone
								denied
								denyDate
								closed
								original
								parent

								minimumCollateral
								riskPremiumPPM
								reserveContribution
								start
								cooldown
								expiration
								challengePeriod

								zchfName
								zchfSymbol
								zchfDecimals

								collateralName
								collateralSymbol
								collateralDecimals
								collateralBalance

								limitForClones
								availableForClones
								availableForMinting
								minted
							}
						}
					}
				`,
			});

			if (!data || !data?.mintingHubV2PositionV2s?.items?.length) {
				this.logger.warn('No Positions V2 found.');
				return;
			}

			const items: PositionQuery[] = data.mintingHubV2PositionV2s.items as PositionQueryV2[];
			const list: PositionsQueryObjectArray = {};
			const balanceOfDataPromises: Promise<bigint>[] = [];
			const mintedDataPromises: Promise<bigint>[] = [];
			const availableForClonesDataPromises: Promise<bigint>[] = [];
			const availableForMintingDataPromises: Promise<bigint>[] = [];

			const leadrate: number = await VIEM_CONFIG[mainnet.id].readContract({
				address: ADDRESS[mainnet.id].savingsV2,
				abi: SavingsABI,
				functionName: 'currentRatePPM',
			});

			const openItems = items.filter((p) => !p.closed && !p.denied) as PositionQueryV2[];
			const closedItems = items.filter((p) => p.closed || p.denied) as PositionQueryV2[];

			for (const p of openItems) {
				// Forces the collateral balance to be overwritten with the latest blockchain state, instead of the ponder state.
				// This ensures that collateral transfers can be made without using the smart contract or application directly,
				// and the API will be aware of the updated state.
				balanceOfDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.collateral,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [p.position],
					})
				);

				// fetch minted - See issue #11
				// https://github.com/Frankencoin-ZCHF/frankencoin-api/issues/11
				mintedDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.position,
						abi: PositionV2ABI,
						functionName: 'minted',
					})
				);

				// make highly available, instead of relying on indexer state
				// https://github.com/Frankencoin-ZCHF/frankencoin-dapp/issues/144
				availableForClonesDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.original,
						abi: PositionV2ABI,
						functionName: 'availableForClones',
					})
				);
				availableForMintingDataPromises.push(
					VIEM_CONFIG[mainnet.id].readContract({
						address: p.position,
						abi: PositionV2ABI,
						functionName: 'availableForMinting',
					})
				);
			}

			// await for contract calls
			const balanceOfData = await Promise.allSettled(balanceOfDataPromises);
			const mintedData = await Promise.allSettled(mintedDataPromises);
			const clonesDate = await Promise.allSettled(availableForClonesDataPromises);
			const mintingDate = await Promise.allSettled(availableForMintingDataPromises);

			for (let idx = 0; idx < openItems.length; idx++) {
				const p = openItems[idx];
				const b = (balanceOfData[idx] as PromiseFulfilledResult<bigint>).value;
				const m = (mintedData[idx] as PromiseFulfilledResult<bigint>).value;
				const ac = (clonesDate[idx] as PromiseFulfilledResult<bigint>).value;
				const am = (mintingDate[idx] as PromiseFulfilledResult<bigint>).value;

				const limitForPosition = (b * BigInt(p.price)) / BigInt(10 ** p.zchfDecimals);
				const availableForPosition = limitForPosition - m;

				const entry: PositionQueryV2 = {
					version: 2,

					position: getAddress(p.position),
					owner: getAddress(p.owner),
					zchf: getAddress(p.zchf),
					collateral: getAddress(p.collateral),
					price: p.price,

					created: parseInt(p.created as any),
					isOriginal: p.isOriginal,
					isClone: p.isClone,
					denied: p.denied,
					denyDate: parseInt(p.denyDate as any),
					closed: p.closed,
					original: getAddress(p.original),
					parent: getAddress(p.parent),

					minimumCollateral: p.minimumCollateral,
					annualInterestPPM: leadrate + p.riskPremiumPPM,
					riskPremiumPPM: p.riskPremiumPPM,
					reserveContribution: p.reserveContribution,
					start: parseInt(p.start as any),
					cooldown: parseInt(p.cooldown as any),
					expiration: parseInt(p.expiration as any),
					challengePeriod: parseInt(p.challengePeriod as any),

					zchfName: p.zchfName,
					zchfSymbol: p.zchfSymbol,
					zchfDecimals: p.zchfDecimals,

					collateralName: p.collateralName,
					collateralSymbol: p.collateralSymbol,
					collateralDecimals: p.collateralDecimals,
					collateralBalance: typeof b === 'bigint' ? b.toString() : p.collateralBalance,

					limitForPosition: limitForPosition.toString(),
					limitForClones: p.limitForClones,
					availableForClones: typeof ac === 'bigint' ? ac.toString() : p.availableForClones,
					availableForMinting: typeof am === 'bigint' ? am.toString() : p.availableForMinting,
					availableForPosition: availableForPosition.toString(),
					minted: typeof m === 'bigint' ? m.toString() : p.minted,
				};

				list[normalizeAddress(p.position)] = entry;
			}

			for (const p of closedItems) {
				const b = BigInt(p.collateralBalance);
				const m = BigInt(p.minted);
				const limitForPosition = (b * BigInt(p.price)) / BigInt(10 ** p.zchfDecimals);
				const availableForPosition = limitForPosition - m;

				list[normalizeAddress(p.position)] = {
					version: 2,

					position: getAddress(p.position),
					owner: getAddress(p.owner),
					zchf: getAddress(p.zchf),
					collateral: getAddress(p.collateral),
					price: p.price,

					created: parseInt(p.created as any),
					isOriginal: p.isOriginal,
					isClone: p.isClone,
					denied: p.denied,
					denyDate: parseInt(p.denyDate as any),
					closed: p.closed,
					original: getAddress(p.original),
					parent: getAddress(p.parent),

					minimumCollateral: p.minimumCollateral,
					annualInterestPPM: leadrate + p.riskPremiumPPM,
					riskPremiumPPM: p.riskPremiumPPM,
					reserveContribution: p.reserveContribution,
					start: parseInt(p.start as any),
					cooldown: parseInt(p.cooldown as any),
					expiration: parseInt(p.expiration as any),
					challengePeriod: parseInt(p.challengePeriod as any),

					zchfName: p.zchfName,
					zchfSymbol: p.zchfSymbol,
					zchfDecimals: p.zchfDecimals,

					collateralName: p.collateralName,
					collateralSymbol: p.collateralSymbol,
					collateralDecimals: p.collateralDecimals,
					collateralBalance: p.collateralBalance,

					limitForPosition: limitForPosition.toString(),
					limitForClones: p.limitForClones,
					availableForClones: p.availableForClones,
					availableForMinting: p.availableForMinting,
					availableForPosition: availableForPosition.toString(),
					minted: p.minted,
				};
			}

			const a = Object.keys(list).length;
			const b = this.fetchedPositionV2s.length;
			const isDiff = a > b;

			if (isDiff) this.logger.log(`Positions V2 merging, from ${b} to ${a} positions`);
			this.fetchedPositionV2s = Object.values(list) as PositionQueryV2[];
			this.fetchedPositions = { ...this.fetchedPositions, ...list };

			return list;
		} catch (error) {
			this.logger.error('Failed to update Positions V2 from indexer', error);
			// Data remains in memory from previous successful fetch
		}
	}

	getMintingUpdatesList(): ApiMintingUpdateListing {
		const m = Object.values(this.fetchedMintingUpdates).flat(1) as MintingUpdateQuery[];
		return {
			num: m.length,
			list: m,
		};
	}

	getMintingUpdatesMapping(): ApiMintingUpdateMapping {
		const m = this.fetchedMintingUpdates;
		return { num: Object.keys(m).length, positions: Object.keys(m) as Address[], map: m };
	}

	async getMintingUpdatesPosition(position: Address, version: number): Promise<ApiMintingUpdateListing> {
		if (version == 1) {
			const { data } = await PONDER_CLIENT.query<{
				mintingHubV1MintingUpdateV1s: {
					items: MintingUpdateQueryV1[];
				};
			}>({
				fetchPolicy: 'no-cache',
				query: gql`
					query {
						mintingHubV1MintingUpdateV1s(
							orderBy: "count"
						 	orderDirection: "desc"
							where: { position: "${normalizeAddress(position)}" }
							limit: 1000
							) {
							items {
								count
								txHash
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
			});

			if (!data || !data?.mintingHubV1MintingUpdateV1s?.items?.length) {
				this.logger.warn('No MintingUpdates V1 found.');
				return {
					num: 0,
					list: [],
				};
			}

			const items: MintingUpdateQuery[] = data.mintingHubV1MintingUpdateV1s.items;

			return {
				num: items.length,
				list: items,
			};
		} else {
			const { data } = await PONDER_CLIENT.query<{
				mintingHubV2MintingUpdateV2s: {
					items: MintingUpdateQueryV2[];
				};
			}>({
				fetchPolicy: 'no-cache',
				query: gql`
					query {
						mintingHubV2MintingUpdateV2s(where: { position: "${normalizeAddress(position)}" }, orderBy: "count", orderDirection: "desc", limit: 1000) {
							items {
								count
								txHash
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								basePremiumPPM
								riskPremiumPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
			});

			if (!data || !data?.mintingHubV2MintingUpdateV2s?.items?.length) {
				this.logger.warn('No MintingUpdates V2 found.');
				return {
					num: 0,
					list: [],
				};
			}

			const items: MintingUpdateQuery[] = data.mintingHubV2MintingUpdateV2s.items;

			return {
				num: items.length,
				list: items,
			};
		}
	}

	async getMintingUpdatesOwner(owner: Address): Promise<ApiMintingUpdateListing> {
		const { data: version1 } = await PONDER_CLIENT.query<{
			mintingHubV1MintingUpdateV1s: { items: MintingUpdateQueryV1[] };
		}>({
			fetchPolicy: 'no-cache',
			query: gql`
					query {
						mintingHubV1MintingUpdateV1s(
							orderBy: "created"
						 	orderDirection: "desc"
							where: { owner: "${normalizeAddress(owner)}" }
							limit: 1000
							) {
							items {
								count
								txHash
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
		});

		const { data: version2 } = await PONDER_CLIENT.query<{ mintingHubV2MintingUpdateV2s: { items: MintingUpdateQueryV2[] } }>({
			fetchPolicy: 'no-cache',
			query: gql`
					query {
						mintingHubV2MintingUpdateV2s(where: { owner: "${normalizeAddress(owner)}" }, orderBy: "count", orderDirection: "desc", limit: 1000) {
							items {
								count
								txHash
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								basePremiumPPM
								riskPremiumPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
		});

		const items: MintingUpdateQuery[] = [
			...version1.mintingHubV1MintingUpdateV1s.items,
			...version2.mintingHubV2MintingUpdateV2s.items,
		];

		return {
			num: items.length,
			list: items,
		};
	}

	async updateMintingUpdateV1s() {
		this.logger.debug('Updating Positions MintingUpdates V1');
		const currentSource = this.dataSource.getCurrentSource();

		// Determine which client to use
		const client = currentSource === 'primary' ? PONDER_CLIENT : PONDER_CLIENT_BACKUP;

		try {
			const { data } = await client!.query<{
				mintingHubV1MintingUpdateV1s: {
					items: MintingUpdateQueryV1[];
				};
			}>({
				fetchPolicy: 'no-cache',
				query: gql`
					query {
						mintingHubV1MintingUpdateV1s(orderBy: "created", orderDirection: "desc", limit: 1000) {
							items {
								txHash
								count
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
			});

			if (!data || !data?.mintingHubV1MintingUpdateV1s?.items?.length) {
				this.logger.warn('No MintingUpdates V1 found.');
				return;
			}

			const items: MintingUpdateQuery[] = data.mintingHubV1MintingUpdateV1s.items;
			const list: MintingUpdateQueryObjectArray = {};

			for (let idx = 0; idx < items.length; idx++) {
				const m = items[idx] as MintingUpdateQueryV1;
				const k = normalizeAddress(m.position);

				if (list[k] === undefined) list[k] = [];

				const entry: MintingUpdateQuery = {
					version: 1,

					id: m.id,
					count: Number(m.count),
					txHash: m.txHash,
					created: parseInt(m.created as any),
					position: getAddress(m.position),
					owner: getAddress(m.owner),
					isClone: m.isClone,
					collateral: getAddress(m.collateral),
					collateralName: m.collateralName,
					collateralSymbol: m.collateralSymbol,
					collateralDecimals: m.collateralDecimals,
					size: m.size,
					price: m.price,
					minted: m.minted,
					sizeAdjusted: m.sizeAdjusted,
					priceAdjusted: m.priceAdjusted,
					mintedAdjusted: m.mintedAdjusted,
					annualInterestPPM: m.annualInterestPPM,
					reserveContribution: m.reserveContribution,
					feeTimeframe: m.feeTimeframe,
					feePPM: m.feePPM,
					feePaid: m.feePaid,
				};

				list[k].push(entry);
			}

			const a = Object.values(list).flat(1).length;
			const b = Object.values(this.fetchedMintingUpdates).flat(1).length;
			const isDiff = a > b;

			if (isDiff) this.logger.log(`MintingUpdates V1 merging, from ${b} to ${a} entries`);
			this.fetchedMintingUpdates = { ...this.fetchedMintingUpdates, ...list };

			return list;
		} catch (error) {
			this.logger.error('Failed to update MintingUpdates V1 from indexer', error);
			// Data remains in memory from previous successful fetch
		}
	}

	async updateMintingUpdateV2s() {
		this.logger.debug('Updating Positions MintingUpdates V2');
		const currentSource = this.dataSource.getCurrentSource();

		// Determine which client to use
		const client = currentSource === 'primary' ? PONDER_CLIENT : PONDER_CLIENT_BACKUP;

		try {
			const { data } = await client!.query<{
				mintingHubV2MintingUpdateV2s: {
					items: MintingUpdateQueryV2[];
				};
			}>({
				fetchPolicy: 'no-cache',
				query: gql`
					query {
						mintingHubV2MintingUpdateV2s(orderBy: "created", orderDirection: "desc", limit: 1000) {
							items {
								txHash
								count
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								basePremiumPPM
								riskPremiumPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
			});

			if (!data || !data?.mintingHubV2MintingUpdateV2s?.items?.length) {
				this.logger.warn('No MintingUpdates V2 found.');
				return;
			}

			const items: MintingUpdateQuery[] = data.mintingHubV2MintingUpdateV2s.items;
			const list: MintingUpdateQueryObjectArray = {};

			for (let idx = 0; idx < items.length; idx++) {
				const m = items[idx] as MintingUpdateQueryV2;
				const k = normalizeAddress(m.position);

				if (list[k] === undefined) list[k] = [];

				const entry: MintingUpdateQueryV2 = {
					version: 2,

					id: m.id,
					count: Number(m.count),
					txHash: m.txHash,
					created: parseInt(m.created as any),
					position: getAddress(m.position),
					owner: getAddress(m.owner),
					isClone: m.isClone,
					collateral: getAddress(m.collateral),
					collateralName: m.collateralName,
					collateralSymbol: m.collateralSymbol,
					collateralDecimals: m.collateralDecimals,
					size: m.size,
					price: m.price,
					minted: m.minted,
					sizeAdjusted: m.sizeAdjusted,
					priceAdjusted: m.priceAdjusted,
					mintedAdjusted: m.mintedAdjusted,
					annualInterestPPM: m.annualInterestPPM,
					basePremiumPPM: m.basePremiumPPM,
					riskPremiumPPM: m.riskPremiumPPM,
					reserveContribution: m.reserveContribution,
					feeTimeframe: m.feeTimeframe,
					feePPM: m.feePPM,
					feePaid: m.feePaid,
				};

				list[k].push(entry);
			}

			const a = Object.values(list).flat(1).length;
			const b = Object.values(this.fetchedMintingUpdates).flat(1).length;
			const isDiff = a > b;

			if (isDiff) this.logger.log(`MintingUpdates V2 merging, from ${b} to ${a} entries`);
			this.fetchedMintingUpdates = { ...this.fetchedMintingUpdates, ...list };

			return list;
		} catch (error) {
			this.logger.error('Failed to update MintingUpdates V2 from indexer', error);
			// Data remains in memory from previous successful fetch
		}
	}

	async getOwnerFees(owner: Address): Promise<ApiMintingUpdateListing> {
		const { data: version1 } = await PONDER_CLIENT.query<{
			mintingHubV1MintingUpdateV1s: { items: MintingUpdateQueryV1[] };
		}>({
			fetchPolicy: 'no-cache',
			query: gql`
					query {
						mintingHubV1MintingUpdateV1s(
							orderBy: "created"
						 	orderDirection: "desc"
							where: { owner: "${normalizeAddress(owner)}", feePaid_gt: "0" }
							limit: 1000
							) {
							items {
								count
								txHash
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
		});

		const { data: version2 } = await PONDER_CLIENT.query<{ mintingHubV2MintingUpdateV2s: { items: MintingUpdateQueryV2[] } }>({
			fetchPolicy: 'no-cache',
			query: gql`
					query {
						mintingHubV2MintingUpdateV2s(where: { owner: "${normalizeAddress(owner)}", feePaid_gt: "0" }, orderBy: "count", orderDirection: "desc", limit: 1000) {
							items {
								count
								txHash
								created
								position
								owner
								isClone
								collateral
								collateralName
								collateralSymbol
								collateralDecimals
								size
								price
								minted
								sizeAdjusted
								priceAdjusted
								mintedAdjusted
								annualInterestPPM
								basePremiumPPM
								riskPremiumPPM
								reserveContribution
								feeTimeframe
								feePPM
								feePaid
							}
						}
					}
				`,
		});

		const items: MintingUpdateQuery[] = [
			...version1.mintingHubV1MintingUpdateV1s.items,
			...version2.mintingHubV2MintingUpdateV2s.items,
		];

		return {
			num: items.length,
			list: items,
		};
	}

	async getOwnerDebt(owner: Address): Promise<ApiOwnerDebt> {
		owner = normalizeAddress(owner);
		const history = await this.getOwnerHistory(owner);

		const years = Object.keys(history).map((i) => Number(i));

		const yearlyDebt: {
			[key: number]: string;
		} = {};

		for (const y of years) {
			const positions = history[y];

			let debt = 0n;
			for (const pos of positions) {
				const updates = this.fetchedMintingUpdates[normalizeAddress(pos)] || [];
				const itemsUntil = updates.filter((i) => i.created * 1000 < new Date(String(y + 1)).getTime());
				const selected = itemsUntil.at(0);
				if (selected != undefined) {
					const m = BigInt(selected.minted);
					const r = BigInt(selected.reserveContribution);
					debt += (m * (BigInt(1_000_000) - r)) / BigInt(1_000_000);
				}
			}

			yearlyDebt[y] = String(debt);
		}

		return yearlyDebt;
	}

	async getOwnerHistory(owner: Address): Promise<ApiOwnerHistory> {
		owner = normalizeAddress(owner);
		const transfers = await this.getOwnerTransfers(owner);

		const years = transfers.list
			.map((i) => new Date(i.created * 1000).getFullYear())
			.reduce((a, b) => {
				return a.includes(b) ? a : [...a, b];
			}, [] as number[]);

		const currentYear = new Date().getFullYear();
		if (!years.includes(currentYear)) years.push(currentYear);

		const yearlyPositions: {
			[key: number]: Address[];
		} = {};

		for (const y of years) {
			if (yearlyPositions[y] == undefined) yearlyPositions[y] = [] as Address[];
			const isCurrentYear = new Date().getFullYear() == y;
			const itemsUntil = transfers.list.filter((i) => new Date(i.created * 1000).getFullYear() <= y);

			for (const tr of itemsUntil) {
				if (tr.newOwner == owner && !yearlyPositions[y].includes(tr.position)) {
					yearlyPositions[y].push(tr.position);
				} else if (tr.previousOwner == owner && yearlyPositions[y].includes(tr.position)) {
					yearlyPositions[y] = yearlyPositions[y].filter((p) => p != tr.position);
				}

				const position = this.getPositionsList().list.find((p) => normalizeAddress(p.position) == normalizeAddress(tr.position));

				if (!isCurrentYear && position.expiration * 1000 < new Date(String(y + 1)).getTime()) {
					yearlyPositions[y] = yearlyPositions[y].filter((p) => p != tr.position);
				} else if (isCurrentYear && position.expiration * 1000 < new Date().getTime()) {
					yearlyPositions[y] = yearlyPositions[y].filter((p) => p != tr.position);
				}
			}
		}

		if (yearlyPositions[currentYear].length == 0) {
			delete yearlyPositions[currentYear];
		}

		return yearlyPositions;
	}

	async getOwnerTransfers(owner: Address): Promise<ApiOwnerTransfersListing> {
		const { data: version1 } = await PONDER_CLIENT.query<{
			mintingHubV1OwnerTransfersV1s: { items: OwnerTransferQuery[] };
		}>({
			fetchPolicy: 'no-cache',
			query: gql`
					query {
						mintingHubV1OwnerTransfersV1s(
							orderBy: "created"
						 	orderDirection: "desc"
							where: { OR: [ { previousOwner: "${normalizeAddress(owner)}" }, { newOwner: "${normalizeAddress(owner)}" }] }
							limit: 1000
							) {
							items {
								version
								count
								txHash
								created
								position
								previousOwner
								newOwner
							}
						}
					}
				`,
		});

		const { data: version2 } = await PONDER_CLIENT.query<{
			mintingHubV2OwnerTransfersV2s: { items: OwnerTransferQuery[] };
		}>({
			fetchPolicy: 'no-cache',
			query: gql`
					query {
						mintingHubV2OwnerTransfersV2s(
							orderBy: "created"
						 	orderDirection: "desc"
							where: { OR: [ { previousOwner: "${normalizeAddress(owner)}" }, { newOwner: "${normalizeAddress(owner)}" }] }
							limit: 1000
							) {
							items {
								version
								count
								txHash
								created
								position
								previousOwner
								newOwner
							}
						}
					}
				`,
		});

		const items: OwnerTransferQuery[] = [
			...version1.mintingHubV1OwnerTransfersV1s.items,
			...version2.mintingHubV2OwnerTransfersV2s.items,
		].sort((a, b) => a.created - b.created);

		return {
			num: items.length,
			list: items,
		};
	}
}
