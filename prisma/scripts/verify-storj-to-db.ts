#!/usr/bin/env ts-node

/**
 * Verify Migration Script
 *
 * Compares data in Storj S3 vs PostgreSQL database to verify migration
 *
 * Usage:
 *   ts-node database/scripts/verify-migration.ts
 *   or
 *   yarn verify:migration
 */

import { PrismaClient } from '@prisma/client';
import { Storj } from '../../src/integrations/storj/storj.s3.service';
import { timestampStartOfDay } from '../../src/utils/format';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const storj = new Storj();

interface VerificationResult {
	prices: number;
	priceHistory: number;
	priceRatio: number;
	telegramGroups: number;
	ecosystemSupply: number;
}

async function checkStorj(): Promise<VerificationResult> {
	console.log('📦 Checking Storj S3...\n');

	const result: VerificationResult = { prices: 0, priceHistory: 0, priceRatio: 0, telegramGroups: 0, ecosystemSupply: 0 };

	try {
		const prices = await storj.read('/prices.query.json');
		if (!prices.messageError && prices.data) {
			result.prices = Object.keys(prices.data).length;
			console.log(`   📊 prices.query.json:           ${result.prices} token addresses`);
		} else {
			console.log(`   ⚠️  prices.query.json: Not found or error`);
		}
	} catch (e) {
		console.log(`   ❌ prices.query.json: Error reading`);
	}

	try {
		const priceHistory = await storj.read('/prices.history.query.json');
		if (!priceHistory.messageError && priceHistory.data) {
			// Collect unique daily timestamps (same deduplication as migration)
			const days = new Set<string>();
			for (const tokenData of Object.values(priceHistory.data)) {
				for (const ts of Object.keys((tokenData as any).history || {})) {
					days.add(timestampStartOfDay(ts));
				}
			}
			result.priceHistory = days.size;
			console.log(`   📈 prices.history.query.json:   ${result.priceHistory} daily entries`);
		} else {
			console.log(`   ⚠️  prices.history.query.json: Not found or error`);
		}
	} catch (e) {
		console.log(`   ❌ prices.history.query.json: Error reading`);
	}

	try {
		const priceRatio = await storj.read('/prices.history.ratio.json');
		if (!priceRatio.messageError && priceRatio.data) {
			const data = priceRatio.data as any;
			const days = new Set<string>();
			for (const ts of [
				...Object.keys(data.collateralRatioByFreeFloat || {}),
				...Object.keys(data.collateralRatioBySupply || {}),
			]) {
				days.add(timestampStartOfDay(ts));
			}
			result.priceRatio = days.size;
			console.log(`   📉 prices.history.ratio.json:   ${result.priceRatio} daily entries`);
		} else {
			console.log(`   ⚠️  prices.history.ratio.json: Not found or error`);
		}
	} catch (e) {
		console.log(`   ❌ prices.history.ratio.json: Error reading`);
	}

	try {
		const telegram = await storj.read('/telegram.groups.json');
		if (!telegram.messageError && telegram.data) {
			result.telegramGroups = ((telegram.data as any).groups as string[]).length;
			console.log(`   💬 telegram.groups.json:        ${result.telegramGroups} groups`);
		} else {
			console.log(`   ⚠️  telegram.groups.json: Not found or error`);
		}
	} catch (e) {
		console.log(`   ❌ telegram.groups.json: Error reading`);
	}

	try {
		const ecosystem = await storj.read('/ecosystem.totalSupply.json');
		if (!ecosystem.messageError && ecosystem.data) {
			result.ecosystemSupply = Object.keys(ecosystem.data).length;
			console.log(`   🌐 ecosystem.totalSupply.json:  ${result.ecosystemSupply} timestamp entries`);
		} else {
			console.log(`   ⚠️  ecosystem.totalSupply.json: Not found or error`);
		}
	} catch (e) {
		console.log(`   ❌ ecosystem.totalSupply.json: Error reading`);
	}

	return result;
}

async function checkDatabase(): Promise<VerificationResult> {
	console.log('\n🗄️  Checking PostgreSQL Database...\n');

	const result: VerificationResult = { prices: 0, priceHistory: 0, priceRatio: 0, telegramGroups: 0, ecosystemSupply: 0 };

	try {
		result.prices = await prisma.priceCache.count();
		console.log(`   📊 price_cache:             ${result.prices} token entries`);

		result.priceHistory = await prisma.priceHistory.count();
		console.log(`   📈 price_history:           ${result.priceHistory} daily entries`);

		result.priceRatio = await prisma.priceHistoryRatio.count();
		console.log(`   📉 price_history_ratio:     ${result.priceRatio} daily entries`);

		result.telegramGroups = await prisma.telegramGroup.count();
		console.log(`   💬 telegram_groups:         ${result.telegramGroups} groups`);

		result.ecosystemSupply = await prisma.ecosystemSupply.count();
		console.log(`   🌐 ecosystem_supply:        ${result.ecosystemSupply} timestamp entries`);
	} catch (error) {
		console.error(`   ❌ Database query error:`, error.message);
	}

	return result;
}

function printComparison(storj: VerificationResult, db: VerificationResult) {
	console.log('\n📊 Migration Verification Summary\n');
	console.log('┌─────────────────────────────────────┬─────────┬──────────┬─────────┐');
	console.log('│ Data Type                           │ Storj   │ Database │ Status  │');
	console.log('├─────────────────────────────────────┼─────────┼──────────┼─────────┤');

	const rows: { label: string; storj: number; db: number }[] = [
		{ label: 'Prices (token addresses)',    storj: storj.prices,         db: db.prices         },
		{ label: 'Price History (daily)',       storj: storj.priceHistory,   db: db.priceHistory   },
		{ label: 'Price Ratio (daily)',         storj: storj.priceRatio,     db: db.priceRatio     },
		{ label: 'Telegram Groups',             storj: storj.telegramGroups, db: db.telegramGroups },
		{ label: 'Ecosystem Supply',            storj: storj.ecosystemSupply,db: db.ecosystemSupply},
	];

	for (const row of rows) {
		const status = row.storj === row.db ? '✅ Match' : row.db > 0 ? '⚠️  Diff' : '❌ Miss ';
		console.log(`│ ${row.label.padEnd(35)} │ ${String(row.storj).padStart(7)} │ ${String(row.db).padStart(8)} │ ${status} │`);
	}

	console.log('└─────────────────────────────────────┴─────────┴──────────┴─────────┘');

	const allMatch = rows.every((r) => r.storj === r.db);
	console.log(`\n📋 Verdict: ${allMatch ? '✅ All data matches' : '⚠️  Mismatches found — check details above'}\n`);
}

async function main() {
	console.log('🔍 FrancEco Migration Verification\n');

	try {
		const storjData = await checkStorj();
		const dbData = await checkDatabase();
		printComparison(storjData, dbData);
	} catch (error) {
		console.error('\n❌ Verification failed:', error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

main()
	.then(() => {
		console.log('✅ Verification complete\n');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n❌ Verification failed:', error);
		process.exit(1);
	});
