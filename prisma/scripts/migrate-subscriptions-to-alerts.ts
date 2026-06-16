#!/usr/bin/env ts-node
/**
 * Migrates TelegramGroup.subscriptions JSON to TelegramUserAlert rows.
 *
 * Old subscriptions (stored without leading slash):
 *   MintingUpdates, PriceAlerts, WeeklyInfos
 *
 * Migration logic:
 *   Everyone gets BASIC (9 types incl. weeklyInfo).
 *   MintingUpdates in old subs → also add mintingUpdates.
 *   PriceAlerts in old subs    → also add priceAlerts.
 *
 * Usage:
 *   yarn telegram:migrate-subscriptions          ← dry run (default)
 *   yarn telegram:migrate-subscriptions true     ← execute
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const execute = process.argv[2] === 'true';

const BASIC_ALERT_TYPES = [
	'positionExpiry',
	'challenge',
	'allPositions',
	'positionProposal',
	'minterProposal',
	'ccipProposal',
	'leadrateProposal',
	'weeklyInfo',
	'equityEvents',
];

type RawGroup = { chatId: string; subscriptions: string | null };

async function main() {
	console.log(execute ? '🚀 Execute mode\n' : '🔍 Dry run — pass "true" to execute\n');

	// Read via raw SQL — subscriptions column was removed from the Prisma schema
	const groups = await prisma.$queryRaw<RawGroup[]>`SELECT "chatId", "subscriptions" FROM telegram_groups`;

	if (groups.length === 0) {
		console.log('No telegram groups found — nothing to migrate.');
		return;
	}

	console.log(`Found ${groups.length} group(s).\n`);

	let totalCreated = 0;

	for (const group of groups) {
		const raw = group.subscriptions;
		const subs: Record<string, boolean> = !raw ? {} : typeof raw === 'string' ? JSON.parse(raw) : (raw as any);

		const hadMinting = subs['MintingUpdates'] === true;
		const hadPriceAlerts = subs['PriceAlerts'] === true;

		const types = [...BASIC_ALERT_TYPES, ...(hadMinting ? ['mintingUpdates'] : []), ...(hadPriceAlerts ? ['priceAlerts'] : [])];

		const extras = [hadMinting && 'mintingUpdates', hadPriceAlerts && 'priceAlerts'].filter(Boolean);
		const label = extras.length ? `basic + ${extras.join(' + ')} (${types.length})` : `basic (${types.length})`;
		console.log(`  ${group.chatId}: ${label}`);

		if (execute) {
			for (const type of types) {
				await prisma.telegramUserAlert.upsert({
					where: { telegramId_type_address: { telegramId: group.chatId, type, address: '' } },
					create: { telegramId: group.chatId, type, address: '' },
					update: {},
				});
				totalCreated++;
			}
		} else {
			totalCreated += types.length;
		}
	}

	console.log(execute ? `\nDone. ${totalCreated} alert(s) created.` : `\nDry run complete. Would create ${totalCreated} alert(s).`);
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
