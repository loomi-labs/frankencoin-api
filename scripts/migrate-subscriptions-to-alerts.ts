#!/usr/bin/env ts-node
/**
 * Migrates TelegramGroup.subscriptions JSON to TelegramUserAlert rows.
 *
 * Old format (per group/chatId):
 *   { MintingUpdates: true, PriceAlerts: true, WeeklyInfos: true }
 *
 * New format (TelegramUserAlert):
 *   { telegramId: chatId, type: "mintingUpdates" | "priceAlerts" | "weeklyInfo", address: "" }
 *
 * Usage:
 *   yarn telegram:migrate-subscriptions
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUBSCRIPTION_MAP: Record<string, string> = {
	MintingUpdates: 'mintingUpdates',
	PriceAlerts: 'priceAlerts',
	WeeklyInfos: 'weeklyInfo',
};

async function main() {
	const groups = await prisma.telegramGroup.findMany();

	if (groups.length === 0) {
		console.log('No telegram groups found — nothing to migrate.');
		return;
	}

	console.log(`Found ${groups.length} group(s). Starting migration...\n`);

	let totalCreated = 0;
	let totalSkipped = 0;

	for (const group of groups) {
		const subs = (group.subscriptions as Record<string, boolean>) ?? {};
		const activeKeys = Object.entries(subs)
			.filter(([, enabled]) => enabled)
			.map(([key]) => key);

		if (activeKeys.length === 0) {
			console.log(`  ${group.chatId}: no active subscriptions, skipping`);
			continue;
		}

		for (const key of activeKeys) {
			const alertType = SUBSCRIPTION_MAP[key];
			if (!alertType) {
				console.log(`  ${group.chatId}: unknown subscription key "${key}", skipping`);
				totalSkipped++;
				continue;
			}

			const result = await prisma.telegramUserAlert.upsert({
				where: {
					telegramId_type_address: {
						telegramId: group.chatId,
						type: alertType,
						address: '',
					},
				},
				create: {
					telegramId: group.chatId,
					type: alertType,
					address: '',
				},
				update: {},
			});

			console.log(`  ${group.chatId}: ${key} → ${alertType} (id: ${result.id})`);
			totalCreated++;
		}
	}

	console.log(`\nDone. ${totalCreated} alert(s) created, ${totalSkipped} skipped.`);
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
