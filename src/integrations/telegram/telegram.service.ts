import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { PositionsService } from 'modules/positions/positions.service';
import { TelegramState } from './telegram.types';
import { EcosystemMinterService } from 'modules/ecosystem/ecosystem.minter.service';
import { MinterProposalMessage } from './messages/MinterProposal.message';
import { PositionProposalMessage } from './messages/PositionProposal.message';
import { PrismaService } from 'core/database/prisma.service';
import { WelcomeGroupMessage } from './messages/WelcomeGroup.message';
import { ChallengesService } from 'modules/challenges/challenges.service';
import { ChallengeStartedMessage } from './messages/ChallengeStarted.message';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PricesService } from 'modules/prices/prices.service';
import { MintingUpdateMessage } from './messages/MintingUpdate.message';
import { MinterProposalVetoedMessage } from './messages/MinterProposalVetoed.message';
import { SavingsLeadrateService } from 'modules/savings/savings.leadrate.service';
import { LeadrateProposalMessage } from './messages/LeadrateProposal.message';
import { LeadrateChangedMessage } from './messages/LeadrateChanged.message';
import { BidTakenMessage } from './messages/BidTaken.message';
import { PositionExpiringSoonMessage } from './messages/PositionExpiringSoon.message';
import { PositionExpiredMessage } from './messages/PositionExpired.message';
import { formatUnits } from 'viem';
import { PriceQuery } from 'modules/prices/prices.types';
import { PositionPriceAlert, PositionPriceLowest, PositionPriceWarning } from './messages/PositionPrice.message';
import { AnalyticsService } from 'modules/analytics/analytics.service';
import { WeeklyInfosMessage } from './messages/WeeklyInfos.message';
import { mainnet } from 'viem/chains';
import { EcosystemFrankencoinService } from 'modules/ecosystem/ecosystem.frankencoin.service';
import { formatFloat, normalizeAddress } from 'utils/format';
import { EquityInvestedMessage } from './messages/EquityInvested.message';
import { EquityRedeemedMessage } from './messages/EquityRedeemed.message';
import { PositionDeniedMessage } from './messages/PositionDenied.message';
import { BridgeService } from 'modules/bridge/bridge.service';
import { CCIPProposalMessage } from './messages/CCIPProposal.message';
import { CCIPProposalDeniedMessage } from './messages/CCIPProposalDenied.message';
import { CCIPProposalEnactedMessage } from './messages/CCIPProposalEnacted.message';
import { CCIPRateLimitMessage } from './messages/CCIPRateLimit.message';
<<<<<<< HEAD
import { AuthService } from 'modules/auth/auth.service';
=======
import { StatusMessage } from './messages/Status.message';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
>>>>>>> upstream/main

@Injectable()
export class TelegramService {
	private readonly startUpTime = Date.now();
	private readonly logger = new Logger(this.constructor.name);
	private readonly bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
	private telegramState: TelegramState;

	constructor(
		private readonly prisma: PrismaService,
		private readonly frankencoin: EcosystemFrankencoinService,
		private readonly minter: EcosystemMinterService,
		private readonly leadrate: SavingsLeadrateService,
		private readonly position: PositionsService,
		private readonly prices: PricesService,
		private readonly challenge: ChallengesService,
		private readonly analytics: AnalyticsService,
		private readonly bridge: BridgeService,
		private readonly authService: AuthService
	) {
		this.telegramState = {
			minterApplied: this.startUpTime,
			minterVetoed: this.startUpTime,
			leadrateProposal: this.startUpTime,
			leadrateChanged: this.startUpTime,
			positions: this.startUpTime,
			positionsDenied: this.startUpTime,
			positionsExpiringSoon1: this.startUpTime,
			positionsExpiringSoon7: this.startUpTime,
			positionsExpired: this.startUpTime,
			positionsPriceAlert: new Map(),
			mintingUpdates: this.startUpTime,
			challenges: this.startUpTime,
			bids: this.startUpTime,
			equityInvested: this.startUpTime,
			equityRedeemed: this.startUpTime,
			ccipProposalNew: this.startUpTime,
			ccipProposalDenied: this.startUpTime,
			ccipProposalEnacted: this.startUpTime,
			ccipRateLimit: this.startUpTime,
		};

		this.applyListener();
	}
<<<<<<< HEAD
=======

	// ─── Sending ─────────────────────────────────────────────────────────────────
>>>>>>> upstream/main

	async sendMessageAll(message: string) {
		const groups = await this.prisma.safeExecute(() => this.prisma.telegramGroup.findMany());
		if (!groups?.length) return;
		for (const group of groups) {
			await this.sendMessage(group.chatId, message);
		}
	}

	async sendMessageGroup(groups: string[], message: string) {
		if (groups.length == 0) return;
		for (const group of groups) {
			await this.sendMessage(group, message);
		}
	}

	async sendMessage(group: string | number, message: string) {
		try {
			this.logger.log(`Sending message to group id: ${group}`);
			await this.bot.sendMessage(group.toString(), message, { parse_mode: 'Markdown', disable_web_page_preview: true });
		} catch (error) {
			const msg = {
				notFound: 'chat not found',
				deleted: 'the group chat was deleted',
				blocked: 'bot was blocked by the user',
				parseEntities: 'parse entities',
			};

			if (typeof error === 'object') {
				if (error?.message.includes(msg.parseEntities)) {
					this.logger.warn(`Markdown parse error for group ${group}, retrying as plain text`);
					try {
						await this.bot.sendMessage(group.toString(), message, { disable_web_page_preview: true });
					} catch (e2) {
						this.logger.warn(`Plain text fallback also failed for group ${group}: ${e2?.message}`);
					}
				} else if (error?.message.includes(msg.deleted)) {
					this.logger.warn(msg.deleted + `: ${group}`);
					this.removeTelegramGroup(group);
				} else if (error?.message.includes(msg.notFound)) {
					this.logger.warn(msg.notFound + `: ${group}`);
					this.removeTelegramGroup(group);
				} else if (error?.message.includes(msg.blocked)) {
					this.logger.warn(msg.blocked + `: ${group}`);
					this.removeTelegramGroup(group);
				} else {
					this.logger.warn(error?.message);
				}
			} else {
				this.logger.warn(error);
			}
		}
	}

	// ─── Group management ─────────────────────────────────────────────────────

	async upsertTelegramGroup(id: number | string): Promise<boolean> {
		if (!id) return false;
		const chatId = id.toString();

		const existing = await this.prisma.safeExecute(() => this.prisma.telegramGroup.findUnique({ where: { chatId } }));
		if (existing) return false;

		try {
			await this.prisma.telegramGroup.create({ data: { chatId } });
		} catch (e: any) {
			return false;
		}

		this.logger.log(`Registered Telegram Group: ${id}`);
		await this.sendMessage(id, WelcomeGroupMessage(id));

		await this.addAlert(id, 'governance', '');
		await this.addAlert(id, 'allPositions', '');
		await this.sendMessage(chatId, '✅ Subscribed to *Governance* and *All Positions* alerts.');
		return true;
	}

	async removeTelegramGroup(id: number | string): Promise<boolean> {
		if (!id) return false;
		const chatId = id.toString();
		const result = await this.prisma.safeExecute(() => this.prisma.telegramGroup.deleteMany({ where: { chatId } }));
		const removed = (result?.count ?? 0) > 0;
		if (removed) {
			this.logger.log(`Removed Telegram Group: ${id}`);
			await this.prisma.safeExecute(() => this.prisma.telegramUserAlert.deleteMany({ where: { telegramId: chatId } }));
		}
		return removed;
	}

	// ─── Alert management ─────────────────────────────────────────────────────

	private async addAlert(telegramId: string | number, type: string, address: string): Promise<void> {
		telegramId = telegramId.toString();
		await this.prisma.safeExecute(() =>
			this.prisma.telegramUserAlert.upsert({
				where: { telegramId_type_address: { telegramId, type, address } },
				create: { telegramId, type, address },
				update: {},
			})
		);
	}

	private async removeAlert(telegramId: string, type: string, address: string): Promise<void> {
		await this.prisma.safeExecute(() => this.prisma.telegramUserAlert.deleteMany({ where: { telegramId, type, address } }));
	}

	// ─── Recipient resolution ─────────────────────────────────────────────────

	private async getGovernanceRecipients(): Promise<string[]> {
		const alerts = await this.prisma.safeExecute(() =>
			this.prisma.telegramUserAlert.findMany({ where: { type: 'governance', address: '' } })
		);
		return alerts?.map((a) => a.telegramId) ?? [];
	}

	private async getAllPositionsRecipients(): Promise<string[]> {
		const alerts = await this.prisma.safeExecute(() =>
			this.prisma.telegramUserAlert.findMany({ where: { type: 'allPositions', address: '' } })
		);
		return alerts?.map((a) => a.telegramId) ?? [];
	}

	// Returns unique telegramIds who watch the given position via allPositions or owner subscription.
	private async getPositionRecipients(position: { owner: string }): Promise<string[]> {
		const [allPosAlerts, ownerAlerts] = await Promise.all([
			this.prisma.safeExecute(() => this.prisma.telegramUserAlert.findMany({ where: { type: 'allPositions', address: '' } })),
			this.prisma.safeExecute(() =>
				this.prisma.telegramUserAlert.findMany({ where: { type: 'owner', address: normalizeAddress(position.owner) } })
			),
		]);

		const seen = new Set<string>();
		for (const a of [...(allPosAlerts ?? []), ...(ownerAlerts ?? [])]) {
			seen.add(a.telegramId);
		}
		return [...seen];
	}

	// ─── Update workflow ───────────────────────────────────────────────────────

	async updateTelegram() {
		const isSoftStart = Date.now() < this.startUpTime + 2 * 60 * 1000;

		this.logger.debug('Updating Telegram');

<<<<<<< HEAD
		// PROPOSAL ALERTS — no position context, simple type subscription

		// Minter Proposal
		const mintersList = this.minter.getMintersList().list.filter((m) => m.applyDate * 1000 > this.telegramState.minterApplied);
		if (mintersList.length > 0) {
			this.telegramState.minterApplied = Date.now();
			const groups = await this.getSubscribedChatIds('minterProposal');
=======
		// GOVERNANCE ALERTS — proposals, CCIP, leadrate

		const mintersList = this.minter.getMintersList().list.filter((m) => m.applyDate * 1000 > this.telegramState.minterApplied);
		if (mintersList.length > 0) {
			this.telegramState.minterApplied = Date.now();
			const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main
			for (const minter of mintersList) {
				this.sendMessageGroup(groups, MinterProposalMessage(minter));
			}
		}

		const mintersVetoed = this.minter
			.getMintersList()
			.list.filter((m) => m.denyDate > 0 && m.denyDate * 1000 > this.telegramState.minterVetoed);
		if (mintersVetoed.length > 0) {
			this.telegramState.minterVetoed = Date.now();
<<<<<<< HEAD
			const groups = await this.getSubscribedChatIds('minterProposal');
=======
			const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main
			for (const minter of mintersVetoed) {
				this.sendMessageGroup(groups, MinterProposalVetoedMessage(minter));
			}
		}

<<<<<<< HEAD
		// Leadrate Proposal
=======
>>>>>>> upstream/main
		const leadrateRates = Object.values(this.leadrate.getInfo().rate[mainnet.id] || {});
		const leadrateProposal = Object.values(this.leadrate.getInfo().open[mainnet.id] || {}).filter(
			(p) => p.details.created * 1000 > this.telegramState.leadrateProposal
		);
		if (leadrateProposal.length > 0) {
			this.telegramState.leadrateProposal = Date.now();
<<<<<<< HEAD
			const groups = await this.getSubscribedChatIds('leadrateProposal');
=======
			const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main
			for (const p of leadrateProposal) {
				this.sendMessageGroup(groups, LeadrateProposalMessage(p.details, leadrateRates));
			}
		}

<<<<<<< HEAD
		// Leadrate Changed
		const leadrateApplied = leadrateRates.filter((r) => r.created * 1000 > this.telegramState.leadrateChanged);
		if (leadrateApplied.length > 0) {
			this.telegramState.leadrateChanged = Date.now();
			const groups = await this.getSubscribedChatIds('leadrateProposal');
=======
		const leadrateApplied = leadrateRates.filter((r) => r.created * 1000 > this.telegramState.leadrateChanged);
		if (leadrateApplied.length > 0) {
			this.telegramState.leadrateChanged = Date.now();
			const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main
			for (const r of leadrateApplied) {
				this.sendMessageGroup(groups, LeadrateChangedMessage(r));
			}
		}

<<<<<<< HEAD
		// Position Proposals requested
=======
>>>>>>> upstream/main
		const requestedPosition = Object.values(this.position.getPositionsRequests().map).filter(
			(r) => r.start * 1000 > Date.now() && r.created * 1000 > this.telegramState.positions
		);
		if (requestedPosition.length > 0) {
			this.telegramState.positions = Date.now();
<<<<<<< HEAD
			const groups = await this.getSubscribedChatIds('positionProposal');
=======
			const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main
			for (const p of requestedPosition) {
				this.sendMessageGroup(groups, PositionProposalMessage(p));
			}
		}

<<<<<<< HEAD
		// Position Proposals denied
=======
>>>>>>> upstream/main
		const deniedPosition = Object.values(this.position.getPositionsDenied().map).filter(
			(p) => p.denyDate > 0 && p.denyDate * 1000 > this.telegramState.positionsDenied
		);
		if (deniedPosition.length > 0) {
			this.telegramState.positionsDenied = Date.now();
<<<<<<< HEAD
			const groups = await this.getSubscribedChatIds('positionProposal');
=======
			const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main
			for (const p of deniedPosition) {
				this.sendMessageGroup(groups, PositionDeniedMessage(p));
			}
		}

<<<<<<< HEAD
		// BRIDGE ALERTS — proposals
		const newCcipProposals = this.bridge.getPendingProposals().filter((p) => p.created * 1000 > this.telegramState.ccipProposalNew);
		if (newCcipProposals.length > 0) {
			this.telegramState.ccipProposalNew = Date.now();
			const groups = await this.getSubscribedChatIds('ccipProposal');
			for (const proposal of newCcipProposals) {
				this.sendMessageGroup(groups, CCIPProposalMessage(proposal));
			}
		}

		const deniedCcipProposals = this.bridge
			.getDeniedProposals()
			.filter((p) => p.deniedAt * 1000 > this.telegramState.ccipProposalDenied);
		if (deniedCcipProposals.length > 0) {
			this.telegramState.ccipProposalDenied = Date.now();
			const groups = await this.getSubscribedChatIds('ccipProposal');
			for (const proposal of deniedCcipProposals) {
				this.sendMessageGroup(groups, CCIPProposalDeniedMessage(proposal));
			}
		}

		const enactedCcipProposals = this.bridge
			.getEnactedProposals()
			.filter((p) => p.enactedAt * 1000 > this.telegramState.ccipProposalEnacted);
		if (enactedCcipProposals.length > 0) {
			this.telegramState.ccipProposalEnacted = Date.now();
			const groups = await this.getSubscribedChatIds('ccipProposal');
			for (const proposal of enactedCcipProposals) {
				this.sendMessageGroup(groups, CCIPProposalEnactedMessage(proposal));
			}
		}

		const rateLimitUpdates = this.bridge
			.getChains()
			.list.filter((c) => c.rateLimitUpdatedAt !== null && c.rateLimitUpdatedAt * 1000 > this.telegramState.ccipRateLimit);
		if (rateLimitUpdates.length > 0) {
			this.telegramState.ccipRateLimit = Date.now();
			const groups = await this.getSubscribedChatIds('ccipProposal');
			for (const chain of rateLimitUpdates) {
				this.sendMessageGroup(groups, CCIPRateLimitMessage(chain));
			}
		}

		// GENERAL ALERTS — no position context

		const { logs } = await this.analytics.getTransactionLog(true, 100);
		const equityMinAmount = 10000;
		const equityGroups = await this.getSubscribedChatIds('equityEvents');

		const equityInvested = logs
			.filter((i) => Number(i.timestamp) * 1000 > this.telegramState.equityInvested)
			.filter((i) => i.kind == 'Equity:Invested')
			.filter((i) => formatFloat(i.amount, 18) >= equityMinAmount);
		if (equityInvested.length > 0) {
			this.telegramState.equityInvested = Date.now();
			for (const i of equityInvested) {
				this.sendMessageGroup(equityGroups, EquityInvestedMessage(i));
			}
		}

		const equityRedeemed = logs
			.filter((i) => Number(i.timestamp) * 1000 > this.telegramState.equityRedeemed)
			.filter((i) => i.kind == 'Equity:Redeemed')
			.filter((i) => formatFloat(i.amount, 18) >= equityMinAmount);
		if (equityRedeemed.length > 0) {
			this.telegramState.equityRedeemed = Date.now();
			for (const i of equityRedeemed) {
				this.sendMessageGroup(equityGroups, EquityRedeemedMessage(i));
			}
		}

		// POSITION-AWARE ALERTS — recipients = has alert type AND watches the position

		const openPositions = Object.values(this.position.getPositionsOpen().map);

		// Position expiring soon (7 days)
		const expiringSoonPosition7 = openPositions.filter((p) => {
			const stateDate = new Date(this.telegramState.positionsExpiringSoon7).getTime();
			const warningDays = 7 * 24 * 60 * 60 * 1000;
			const isSoon = p.expiration * 1000 < Date.now() + warningDays;
			const isNew = isSoon && stateDate + warningDays < p.expiration * 1000;
			return isSoon && isNew;
		});
		if (expiringSoonPosition7.length > 0) {
			this.telegramState.positionsExpiringSoon7 = Date.now();
			for (const p of expiringSoonPosition7) {
				const recipients = await this.getAlertRecipients('positionExpiry', p);
				this.sendMessageGroup(recipients, PositionExpiringSoonMessage(p));
			}
		}

		// Position expiring soon (24 hours)
		const expiringSoonPosition1 = openPositions.filter((p) => {
			const stateDate = new Date(this.telegramState.positionsExpiringSoon1).getTime();
			const warningDays = 1 * 24 * 60 * 60 * 1000;
			const isSoon = p.expiration * 1000 < Date.now() + warningDays;
			const isNew = isSoon && stateDate + warningDays < p.expiration * 1000;
			return isSoon && isNew;
		});
		if (expiringSoonPosition1.length > 0) {
			this.telegramState.positionsExpiringSoon1 = Date.now();
			for (const p of expiringSoonPosition1) {
				const recipients = await this.getAlertRecipients('positionExpiry', p);
				this.sendMessageGroup(recipients, PositionExpiringSoonMessage(p));
			}
		}

		// Positions expired
		const expiredPosition = openPositions.filter((p) => {
			const stateDate = new Date(this.telegramState.positionsExpired).getTime();
			const isExpired = p.expiration * 1000 < Date.now();
			const isNew = isExpired && stateDate < p.expiration * 1000;
			return isExpired && isNew;
		});
		if (expiredPosition.length > 0) {
			this.telegramState.positionsExpired = Date.now();
			for (const p of expiredPosition) {
				const recipients = await this.getAlertRecipients('positionExpiry', p);
				this.sendMessageGroup(recipients, PositionExpiredMessage(p));
			}
		} else {
			// @dev: fixes issue if ponder indexes and stateDate didnt change,
			// it might happen that an old state will trigger this due to re-indexing

			// reset to last 1h
			if (Date.now() - this.telegramState.positionsExpired > 60 * 60 * 1000) {
				this.telegramState.positionsExpired = Date.now() - 5 * 60 * 1000; // reduce 5min to allow latest expiration
			}
		}

		// Minting updates
		const requestedMintingUpdates = this.position
			.getMintingUpdatesList()
			.list.filter((m) => m.created * 1000 > this.telegramState.mintingUpdates && BigInt(m.mintedAdjusted) > 0n);
		if (requestedMintingUpdates.length > 0) {
			this.telegramState.mintingUpdates = Date.now();
			const prices = this.prices.getPricesMapping();
			for (const m of requestedMintingUpdates) {
				const pos = openPositions.find((p) => normalizeAddress(p.position) === normalizeAddress(m.position));
				if (!pos) continue;
				const recipients = await this.getAlertRecipients('mintingUpdates', pos);
				this.sendMessageGroup(recipients, MintingUpdateMessage(m, prices));
			}
		}

		// Challenges started
		const challengesStarted = Object.values(this.challenge.getChallengesMapping().map).filter(
			(c) => parseInt(c.created.toString()) * 1000 > this.telegramState.challenges
		);
		if (challengesStarted.length > 0) {
			this.telegramState.challenges = Date.now();
			for (const c of challengesStarted) {
				const pos = this.position.getPositionsList().list.find((p) => normalizeAddress(p.position) == normalizeAddress(c.position));
				if (pos == undefined) continue;
				const recipients = await this.getAlertRecipients('challenge', pos);
				this.sendMessageGroup(recipients, ChallengeStartedMessage(pos, c));
			}
		}

		// Bids taken
		const bidsTaken = Object.values(this.challenge.getBidsMapping().map).filter(
			(b) => parseInt(b.created.toString()) * 1000 > this.telegramState.bids
		);
		if (bidsTaken.length > 0) {
			this.telegramState.bids = Date.now();
			for (const b of bidsTaken) {
				const pos = this.position.getPositionsList().list.find((p) => normalizeAddress(p.position) == normalizeAddress(b.position));
				const challenge = this.challenge
					.getChallenges()
					.list.find((c) => normalizeAddress(c.position) == normalizeAddress(b.position) && c.number == b.number);
				if (pos == undefined || challenge == undefined) continue;
				const recipients = await this.getAlertRecipients('challenge', pos);
				this.sendMessageGroup(recipients, BidTakenMessage(pos, challenge, b));
			}
		}

		// Price alerts — per-user cooldown via positionsPriceAlert keyed by telegramId:posAddr
		const THRES_LOWEST = 1; // 100%
		const THRES_ALERT = 1.05; // 105%
		const THRES_WARN = 1.1; // 110%
		const DELAY_LOWEST = 2 * 60 * 60 * 1000; // 2h
		const DELAY_ALERT = 12 * 60 * 60 * 1000; // 12h
		const DELAY_WARNING = 24 * 60 * 60 * 1000; // 24h

		for (const p of openPositions) {
			const posPrice = parseFloat(formatUnits(BigInt(p.price), 36 - p.collateralDecimals));
			const priceQuery: PriceQuery | undefined = this.prices.getPricesMapping()[normalizeAddress(p.collateral)];
			if (priceQuery == undefined || priceQuery.timestamp === 0) continue;

			const price = priceQuery.price.chf;
			if (posPrice * THRES_WARN < price) continue;

			const recipients = await this.getAlertRecipients('priceAlerts', p);
			if (!recipients.length) continue;

			const posAddr = normalizeAddress(p.position);
			for (const telegramId of recipients) {
				const cooldownKey = `${telegramId}:${posAddr}`;
				const last = this.telegramState.positionsPriceAlert.get(cooldownKey) ?? {
					alertTimestamp: 0,
					warningTimestamp: 0,
					lowestTimestamp: 0,
					lowestPrice: 0,
				};

				if (price < posPrice * THRES_LOWEST) {
					if (last.lowestTimestamp + DELAY_LOWEST < Date.now()) {
						if (last.lowestPrice === 0 || last.lowestPrice * 0.98 > price) {
							!isSoftStart && (await this.sendMessage(telegramId, PositionPriceLowest(p, priceQuery, last)));
							last.lowestPrice = price;
						}
						last.lowestTimestamp = Date.now();
					}
				} else if (price < posPrice * THRES_ALERT) {
					if (last.alertTimestamp + DELAY_ALERT < Date.now()) {
						!isSoftStart && (await this.sendMessage(telegramId, PositionPriceAlert(p, priceQuery, last)));
						last.alertTimestamp = Date.now();
					}
				} else if (price < posPrice * THRES_WARN) {
					if (last.warningTimestamp + DELAY_WARNING < Date.now()) {
						!isSoftStart && (await this.sendMessage(telegramId, PositionPriceWarning(p, priceQuery, last)));
						last.warningTimestamp = Date.now();
					}
				}

				if (price > posPrice * THRES_ALERT && last.lowestTimestamp > 0) {
					last.lowestTimestamp = 0;
					last.lowestPrice = 0;
				}

				this.telegramState.positionsPriceAlert.set(cooldownKey, last);
=======
		const newCcipProposals = this.bridge.getPendingProposals().filter((p) => p.created * 1000 > this.telegramState.ccipProposalNew);
		if (newCcipProposals.length > 0) {
			this.telegramState.ccipProposalNew = Date.now();
			const groups = await this.getGovernanceRecipients();
			for (const proposal of newCcipProposals) {
				this.sendMessageGroup(groups, CCIPProposalMessage(proposal));
			}
		}

		const deniedCcipProposals = this.bridge
			.getDeniedProposals()
			.filter((p) => p.deniedAt * 1000 > this.telegramState.ccipProposalDenied);
		if (deniedCcipProposals.length > 0) {
			this.telegramState.ccipProposalDenied = Date.now();
			const groups = await this.getGovernanceRecipients();
			for (const proposal of deniedCcipProposals) {
				this.sendMessageGroup(groups, CCIPProposalDeniedMessage(proposal));
			}
		}

		const enactedCcipProposals = this.bridge
			.getEnactedProposals()
			.filter((p) => p.enactedAt * 1000 > this.telegramState.ccipProposalEnacted);
		if (enactedCcipProposals.length > 0) {
			this.telegramState.ccipProposalEnacted = Date.now();
			const groups = await this.getGovernanceRecipients();
			for (const proposal of enactedCcipProposals) {
				this.sendMessageGroup(groups, CCIPProposalEnactedMessage(proposal));
			}
		}

		const rateLimitUpdates = this.bridge
			.getChains()
			.list.filter((c) => c.rateLimitUpdatedAt !== null && c.rateLimitUpdatedAt * 1000 > this.telegramState.ccipRateLimit);
		if (rateLimitUpdates.length > 0) {
			this.telegramState.ccipRateLimit = Date.now();
			const groups = await this.getGovernanceRecipients();
			for (const chain of rateLimitUpdates) {
				this.sendMessageGroup(groups, CCIPRateLimitMessage(chain));
			}
		}

		// GOVERNANCE ALERTS (equity) — large equity events

		const { logs } = await this.analytics.getTransactionLog(true, 100);
		const equityMinAmount = 10000;
		const equityGroups = await this.getGovernanceRecipients();

		const equityInvested = logs
			.filter((i) => Number(i.timestamp) * 1000 > this.telegramState.equityInvested)
			.filter((i) => i.kind == 'Equity:Invested')
			.filter((i) => formatFloat(i.amount, 18) >= equityMinAmount);
		if (equityInvested.length > 0) {
			this.telegramState.equityInvested = Date.now();
			for (const i of equityInvested) {
				this.sendMessageGroup(equityGroups, EquityInvestedMessage(i));
			}
		}

		const equityRedeemed = logs
			.filter((i) => Number(i.timestamp) * 1000 > this.telegramState.equityRedeemed)
			.filter((i) => i.kind == 'Equity:Redeemed')
			.filter((i) => formatFloat(i.amount, 18) >= equityMinAmount);
		if (equityRedeemed.length > 0) {
			this.telegramState.equityRedeemed = Date.now();
			for (const i of equityRedeemed) {
				this.sendMessageGroup(equityGroups, EquityRedeemedMessage(i));
			}
		}

		// POSITION-AWARE ALERTS — recipients = allPositions OR owner matches

		const openPositions = Object.values(this.position.getPositionsOpen().map);

		const expiringSoonPosition7 = openPositions.filter((p) => {
			const stateDate = new Date(this.telegramState.positionsExpiringSoon7).getTime();
			const warningDays = 7 * 24 * 60 * 60 * 1000;
			const isSoon = p.expiration * 1000 < Date.now() + warningDays;
			const isNew = isSoon && stateDate + warningDays < p.expiration * 1000;
			return isSoon && isNew;
		});
		if (expiringSoonPosition7.length > 0) {
			this.telegramState.positionsExpiringSoon7 = Date.now();
			for (const p of expiringSoonPosition7) {
				const recipients = await this.getPositionRecipients(p);
				this.sendMessageGroup(recipients, PositionExpiringSoonMessage(p));
			}
		}

		const expiringSoonPosition1 = openPositions.filter((p) => {
			const stateDate = new Date(this.telegramState.positionsExpiringSoon1).getTime();
			const warningDays = 1 * 24 * 60 * 60 * 1000;
			const isSoon = p.expiration * 1000 < Date.now() + warningDays;
			const isNew = isSoon && stateDate + warningDays < p.expiration * 1000;
			return isSoon && isNew;
		});
		if (expiringSoonPosition1.length > 0) {
			this.telegramState.positionsExpiringSoon1 = Date.now();
			for (const p of expiringSoonPosition1) {
				const recipients = await this.getPositionRecipients(p);
				this.sendMessageGroup(recipients, PositionExpiringSoonMessage(p));
			}
		}

		const expiredPosition = openPositions.filter((p) => {
			const stateDate = new Date(this.telegramState.positionsExpired).getTime();
			const isExpired = p.expiration * 1000 < Date.now();
			const isNew = isExpired && stateDate < p.expiration * 1000;
			return isExpired && isNew;
		});
		if (expiredPosition.length > 0) {
			this.telegramState.positionsExpired = Date.now();
			for (const p of expiredPosition) {
				const recipients = await this.getPositionRecipients(p);
				this.sendMessageGroup(recipients, PositionExpiredMessage(p));
			}
		} else {
			// @dev: fixes issue if ponder indexes and stateDate didnt change,
			// it might happen that an old state will trigger this due to re-indexing
			if (Date.now() - this.telegramState.positionsExpired > 60 * 60 * 1000) {
				this.telegramState.positionsExpired = Date.now() - 5 * 60 * 1000;
			}
		}

		const requestedMintingUpdates = this.position
			.getMintingUpdatesList()
			.list.filter((m) => m.created * 1000 > this.telegramState.mintingUpdates && BigInt(m.mintedAdjusted) > 0n);
		if (requestedMintingUpdates.length > 0) {
			this.telegramState.mintingUpdates = Date.now();
			const prices = this.prices.getPricesMapping();
			for (const m of requestedMintingUpdates) {
				const pos = openPositions.find((p) => normalizeAddress(p.position) === normalizeAddress(m.position));
				if (!pos) continue;
				const recipients = await this.getPositionRecipients(pos);
				this.sendMessageGroup(recipients, MintingUpdateMessage(m, prices));
>>>>>>> upstream/main
			}
		}

<<<<<<< HEAD
	async upsertTelegramGroup(id: number | string): Promise<boolean> {
		if (!id) return false;
		const existing = await this.prisma.safeExecute(() => this.prisma.telegramGroup.findUnique({ where: { chatId: id.toString() } }));
		if (existing) return false;
		await this.prisma.safeExecute(() => this.prisma.telegramGroup.create({ data: { chatId: id.toString() } }));
		this.logger.log(`Upserted Telegram Group: ${id}`);
		this.sendMessage(id, WelcomeGroupMessage(id));
		return true;
	}

	async removeTelegramGroup(id: number | string): Promise<boolean> {
		if (!id) return false;
		const result = await this.prisma.safeExecute(() => this.prisma.telegramGroup.deleteMany({ where: { chatId: id.toString() } }));
		const removed = (result?.count ?? 0) > 0;
		if (removed) this.logger.log(`Removed Telegram Group: ${id}`);
		return removed;
	}

	async getSubscribedChatIds(type: string): Promise<string[]> {
		const alerts = await this.prisma.safeExecute(() => this.prisma.telegramUserAlert.findMany({ where: { type, address: '' } }));
		return alerts?.map((a) => a.telegramId) ?? [];
	}

	// Returns unique telegramIds who have opted into alertType AND watch the given position
	// via any of: allPositions, specific position address, owner address, or collateral address.
	async getAlertRecipients(alertType: string, position: { position: string; owner: string; collateral: string }): Promise<string[]> {
		const [typeAlerts, allPosAlerts, posAlerts, ownerAlerts, collateralAlerts] = await Promise.all([
			this.prisma.safeExecute(() => this.prisma.telegramUserAlert.findMany({ where: { type: alertType, address: '' } })),
			this.prisma.safeExecute(() => this.prisma.telegramUserAlert.findMany({ where: { type: 'allPositions', address: '' } })),
			this.prisma.safeExecute(() =>
				this.prisma.telegramUserAlert.findMany({ where: { type: 'position', address: normalizeAddress(position.position) } })
			),
			this.prisma.safeExecute(() =>
				this.prisma.telegramUserAlert.findMany({ where: { type: 'owner', address: normalizeAddress(position.owner) } })
			),
			this.prisma.safeExecute(() =>
				this.prisma.telegramUserAlert.findMany({ where: { type: 'collateral', address: normalizeAddress(position.collateral) } })
			),
		]);

		const hasAlertType = new Set((typeAlerts ?? []).map((a) => a.telegramId));
		const watchesPosition = new Set(
			[...(allPosAlerts ?? []), ...(posAlerts ?? []), ...(ownerAlerts ?? []), ...(collateralAlerts ?? [])].map((a) => a.telegramId)
		);

		return [...hasAlertType].filter((id) => watchesPosition.has(id));
=======
		const challengesStarted = Object.values(this.challenge.getChallengesMapping().map).filter(
			(c) => parseInt(c.created.toString()) * 1000 > this.telegramState.challenges
		);
		if (challengesStarted.length > 0) {
			this.telegramState.challenges = Date.now();
			for (const c of challengesStarted) {
				const pos = this.position.getPositionsList().list.find((p) => normalizeAddress(p.position) == normalizeAddress(c.position));
				if (pos == undefined) continue;
				const recipients = await this.getPositionRecipients(pos);
				this.sendMessageGroup(recipients, ChallengeStartedMessage(pos, c));
			}
		}

		const bidsTaken = Object.values(this.challenge.getBidsMapping().map).filter(
			(b) => parseInt(b.created.toString()) * 1000 > this.telegramState.bids
		);
		if (bidsTaken.length > 0) {
			this.telegramState.bids = Date.now();
			for (const b of bidsTaken) {
				const pos = this.position.getPositionsList().list.find((p) => normalizeAddress(p.position) == normalizeAddress(b.position));
				const challenge = this.challenge
					.getChallenges()
					.list.find((c) => normalizeAddress(c.position) == normalizeAddress(b.position) && c.number == b.number);
				if (pos == undefined || challenge == undefined) continue;
				const recipients = await this.getPositionRecipients(pos);
				this.sendMessageGroup(recipients, BidTakenMessage(pos, challenge, b));
			}
		}

		// Price alerts — per-position cooldown via positionsPriceAlert keyed by posAddr
		const THRES_LOWEST = 1;
		const THRES_ALERT = 1.05;
		const THRES_WARN = 1.1;
		const DELAY_LOWEST = 2 * 60 * 60 * 1000;
		const DELAY_ALERT = 12 * 60 * 60 * 1000;
		const DELAY_WARNING = 24 * 60 * 60 * 1000;

		for (const p of openPositions) {
			const posPrice = parseFloat(formatUnits(BigInt(p.price), 36 - p.collateralDecimals));
			const priceQuery: PriceQuery | undefined = this.prices.getPricesMapping()[normalizeAddress(p.collateral)];
			if (priceQuery == undefined || priceQuery.timestamp === 0) continue;

			const price = priceQuery.price.chf;
			if (posPrice * THRES_WARN < price) continue;

			const recipients = await this.getPositionRecipients(p);
			if (!recipients.length) continue;

			const posAddr = normalizeAddress(p.position);
			const last = this.telegramState.positionsPriceAlert.get(posAddr) ?? {
				alertTimestamp: 0,
				warningTimestamp: 0,
				lowestTimestamp: 0,
				lowestPrice: 0,
			};

			if (price < posPrice * THRES_LOWEST) {
				if (last.lowestTimestamp + DELAY_LOWEST < Date.now()) {
					if (last.lowestPrice === 0 || last.lowestPrice * 0.98 > price) {
						!isSoftStart && (await this.sendMessageGroup(recipients, PositionPriceLowest(p, priceQuery, last)));
						last.lowestPrice = price;
					}
					last.lowestTimestamp = Date.now();
				}
			} else if (price < posPrice * THRES_ALERT) {
				if (last.alertTimestamp + DELAY_ALERT < Date.now()) {
					!isSoftStart && (await this.sendMessageGroup(recipients, PositionPriceAlert(p, priceQuery, last)));
					last.alertTimestamp = Date.now();
				}
			} else if (price < posPrice * THRES_WARN) {
				if (last.warningTimestamp + DELAY_WARNING < Date.now()) {
					!isSoftStart && (await this.sendMessageGroup(recipients, PositionPriceWarning(p, priceQuery, last)));
					last.warningTimestamp = Date.now();
				}
			}

			if (price > posPrice * THRES_ALERT && last.lowestTimestamp > 0) {
				last.lowestTimestamp = 0;
				last.lowestPrice = 0;
			}

			this.telegramState.positionsPriceAlert.set(posAddr, last);
		}
>>>>>>> upstream/main
	}

	// ─── Command handlers ─────────────────────────────────────────────────────

	private async handleStart(chatId: number | string, id: string, param: string): Promise<void> {
		if (param === '') {
			await this.addAlert(id, 'governance', '');
			await this.addAlert(id, 'allPositions', '');
			await this.sendMessage(chatId, '✅ Subscribed to *Governance* and *All Positions* alerts.');
		} else if (param.toUpperCase() === 'GOV') {
			await this.addAlert(id, 'governance', '');
			await this.sendMessage(chatId, '✅ Subscribed to *Governance* alerts.');
		} else if (param.toUpperCase() === 'ALL') {
			await this.addAlert(id, 'allPositions', '');
			await this.sendMessage(chatId, '✅ Subscribed to *All Positions* alerts.');
		} else if (ADDRESS_REGEX.test(param)) {
			const addr = normalizeAddress(param);
			await this.addAlert(id, 'owner', addr);
			await this.sendMessage(chatId, `✅ Subscribed to owner \`${addr}\`.`);
		} else {
			await this.sendMessage(
				chatId,
				`⚠️ Unknown parameter: \`${param}\`\n\nUsage: /start · /start GOV · /start ALL · /start <owner address>`
			);
		}
	}

	private async handleStop(chatId: number | string, id: string, param: string): Promise<void> {
		if (param === '') {
			await this.sendMessage(chatId, `ℹ️ Specify what to stop:\n/stop GOV · /stop ALL · /stop <owner address>`);
		} else if (param.toUpperCase() === 'GOV') {
			await this.removeAlert(id, 'governance', '');
			await this.sendMessage(chatId, '✅ Governance alerts removed.');
		} else if (param.toUpperCase() === 'ALL') {
			await this.removeAlert(id, 'allPositions', '');
			await this.sendMessage(chatId, '✅ All Positions alerts removed.');
		} else if (ADDRESS_REGEX.test(param)) {
			const addr = normalizeAddress(param);
			await this.removeAlert(id, 'owner', addr);
			await this.sendMessage(chatId, `✅ Stopped tracking \`${addr}\`.`);
		} else {
			await this.sendMessage(chatId, `⚠️ Unknown parameter: \`${param}\`\n\nUsage: /stop GOV · /stop ALL · /stop <owner address>`);
		}
	}

	private async handleStatus(chatId: number | string, id: string): Promise<void> {
		const alerts = await this.prisma.safeExecute(() => this.prisma.telegramUserAlert.findMany({ where: { telegramId: id } }));
		const governance = alerts?.some((a) => a.type === 'governance') ?? false;
		const allPositions = alerts?.some((a) => a.type === 'allPositions') ?? false;
		const owners = alerts?.filter((a) => a.type === 'owner').map((a) => a.address) ?? [];
		await this.sendMessage(chatId, StatusMessage(chatId, governance, allPositions, owners));
	}

	// ─── Bot listener ─────────────────────────────────────────────────────────

	async applyListener() {
		try {
			await this.bot.setMyCommands([
<<<<<<< HEAD
				{ command: 'start', description: 'Connect this chat & show info' },
				{ command: 'sessions', description: 'View & manage linked app sessions' },
				{ command: 'help', description: 'Show status & info' },
=======
				{ command: 'start', description: 'Subscribe to alerts (GOV, ALL, or owner address)' },
				{ command: 'stop', description: 'Unsubscribe (GOV, ALL, or owner address)' },
				{ command: 'status', description: 'Show your active subscriptions' },
				{ command: 'help', description: 'Show available commands' },
>>>>>>> upstream/main
			]);
			this.logger.log('Bot command menu registered');
		} catch (e) {
			this.logger.warn(`Failed to set bot commands: ${e.message}`);
		}

		this.bot.on('message', async (m) => {
<<<<<<< HEAD
			const isNew = await this.upsertTelegramGroup(m.chat.id);

			// In group chats Telegram appends @botname to commands: "/start@botname PARAM"
			// Strip it so the rest of the handler works identically for DMs and groups.
			const text = m.text?.replace(/^(\/\w+)@\w+/, '$1');

			if (text?.startsWith('/start') || text === '/help') {
				const param = text?.startsWith('/start ') ? text.slice(7).trim() : null;
				if (param?.startsWith('link_')) {
					const jti = param.slice(5);
					const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup';
					const id = isGroup ? m.chat.id.toString() : m.from?.id?.toString();
					const context = isGroup ? 'group' : 'dm';
					if (jti && id) {
						const linked = await this.authService.linkSession(jti, id, context);
						await this.sendMessage(
							m.chat.id,
							linked ? '✅ Successfully linked! Return to the app.' : '⚠️ Link expired or already used.'
						);
						return;
					}
				}
				// WelcomeGroup already sent for new chats — skip Help to avoid double message
				if (!isNew) await this.sendMessage(m.chat.id, HelpMessage(m.chat.id));
			} else if (text === '/sessions') {
				const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup';
				const id = isGroup ? m.chat.id.toString() : m.from?.id?.toString();
				if (!id) return;
				const count = await this.authService.getSessionCount(id);
				try {
					await this.bot.sendMessage(m.chat.id, `📱 You have *${count}* linked session${count !== 1 ? 's' : ''}.`, {
						parse_mode: 'Markdown',
						reply_markup:
							count > 0
								? { inline_keyboard: [[{ text: '🗑 Remove all sessions', callback_data: 'sessions:remove_all' }]] }
								: undefined,
					});
				} catch (e) {
					this.logger.warn(`/sessions failed: ${e?.message}`);
				}
			}
		});

		this.bot.on('callback_query', async (query) => {
			if (query.data === 'sessions:remove_all') {
				const isGroup = query.message?.chat?.type === 'group' || query.message?.chat?.type === 'supergroup';
				const id = isGroup ? query.message?.chat?.id?.toString() : query.from?.id?.toString();
				if (id) {
					await this.authService.removeAllSessions(id);
					await this.bot.answerCallbackQuery(query.id, { text: '✅ All sessions removed.' });
					try {
						await this.bot.editMessageText('🗑 All linked sessions removed.', {
							chat_id: query.message.chat.id,
							message_id: query.message.message_id,
						});
					} catch (_) {}
				}
			}
		});
=======
			await this.upsertTelegramGroup(m.chat.id);

			const text = m.text?.replace(/^(\/\w+)@\w+/, '$1');
			if (!text) return;

			const id = m.chat.id.toString();

			if (text.startsWith('/start')) {
				const param = text.slice(6).trim();
				await this.handleStart(m.chat.id, id, param);
			} else if (text.startsWith('/stop')) {
				const param = text.slice(5).trim();
				await this.handleStop(m.chat.id, id, param);
			} else if (text === '/status') {
				await this.handleStatus(m.chat.id, id);
			} else if (text === '/help') {
				await this.sendMessage(m.chat.id, WelcomeGroupMessage(m.chat.id));
			}
		});
>>>>>>> upstream/main
	}

	// ─── Scheduled jobs ───────────────────────────────────────────────────────

	@Cron(CronExpression.EVERY_WEEK)
	async scheduleWeeklyInfos() {
<<<<<<< HEAD
		const days = 3600 * 24 * 30; // seconds
		const infos = this.analytics.getDailyLog().logs.filter((i) => Number(i.timestamp) >= Date.now() / 1000 - days);
		const groups = await this.getSubscribedChatIds('weeklyInfo');
=======
		const days = 3600 * 24 * 30;
		const infos = this.analytics.getDailyLog().logs.filter((i) => Number(i.timestamp) >= Date.now() / 1000 - days);
		const groups = await this.getGovernanceRecipients();
>>>>>>> upstream/main

		const before = infos.at(0);
		const now = infos.at(-1);

		if (!before || !now) {
			this.logger.warn('scheduleWeeklyInfos: no analytics data available, skipping');
			return;
		}

		const supply = this.frankencoin.getTotalSupply();
		this.sendMessageGroup(groups, WeeklyInfosMessage(before, now, supply));
	}
}
