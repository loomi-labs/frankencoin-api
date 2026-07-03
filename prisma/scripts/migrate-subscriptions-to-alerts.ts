#!/usr/bin/env ts-node
/**
<<<<<<< HEAD
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
=======
 * Resets TelegramUserAlert table and seeds every known TelegramGroup with
 * the two default alert types: governance (GOV) and allPositions (ALL).
 *
 * Usage:
 *   yarn migrate:subscriptions          ← dry run (default)
 *   yarn migrate:subscriptions true     ← execute
>>>>>>> upstream/main
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const execute = process.argv[2] === 'true';

<<<<<<< HEAD
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
=======
const DEFAULT_ALERTS: { type: string; address: string }[] = [
	{ type: 'governance', address: '' },
	{ type: 'allPositions', address: '' },
];

async function main() {
	console.log(execute ? '🚀 Execute mode\n' : '🔍 Dry run — pass "true" to execute\n');

	const groups = await prisma.telegramGroup.findMany({ select: { chatId: true } });
>>>>>>> upstream/main

	if (groups.length === 0) {
		console.log('No telegram groups found — nothing to migrate.');
		return;
	}

	console.log(`Found ${groups.length} group(s).\n`);

<<<<<<< HEAD
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
=======
	if (execute) {
		const deleted = await prisma.telegramUserAlert.deleteMany();
		console.log(`Deleted ${deleted.count} existing alert(s).\n`);
	} else {
		const count = await prisma.telegramUserAlert.count();
		console.log(`Dry run: would delete ${count} existing alert(s).\n`);
	}

	let totalCreated = 0;

	for (const group of groups) {
		console.log(`  ${group.chatId}: governance + allPositions`);

		if (execute) {
			for (const alert of DEFAULT_ALERTS) {
				await prisma.telegramUserAlert.create({
					data: { telegramId: group.chatId, type: alert.type, address: alert.address },
>>>>>>> upstream/main
				});
				totalCreated++;
			}
		} else {
<<<<<<< HEAD
			totalCreated += types.length;
=======
			totalCreated += DEFAULT_ALERTS.length;
>>>>>>> upstream/main
		}
	}

	console.log(execute ? `\nDone. ${totalCreated} alert(s) created.` : `\nDry run complete. Would create ${totalCreated} alert(s).`);
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
