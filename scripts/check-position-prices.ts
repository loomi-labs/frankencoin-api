#!/usr/bin/env ts-node
/**
 * Compare API position prices vs on-chain prices for all open V2 positions.
 * Useful to detect positions where the indexer missed price-update events.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/check-position-prices.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Address } from 'viem';
import { mainnet } from 'viem/chains';
import { PositionV2ABI } from '@frankencoin/zchf';
import { VIEM_CONFIG } from 'app.config';
import { ApiPositionsMapping, PositionQueryV2 } from 'modules/positions/positions.types';

const API_URL = 'https://api.frankencoin.com';

async function fetchOpenPositions(): Promise<PositionQueryV2[]> {
	const res = await fetch(`${API_URL}/positions/open`);
	if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
	const data: ApiPositionsMapping = await res.json();
	return Object.values(data.map as Record<string, PositionQueryV2>).filter((p) => p.version === 2);
}

async function fetchOnchainPrice(position: Address): Promise<bigint> {
	return VIEM_CONFIG[mainnet.id].readContract({
		address: position,
		abi: PositionV2ABI,
		functionName: 'price',
	}) as Promise<bigint>;
}

// price() returns ZCHF per collateral, scaled so that:
//   limit_raw_ZCHF = collateral_raw * price / 10^zchfDecimals
// Human-readable price = price / 10^(zchfDecimals * 2 - collateralDecimals)
function formatPrice(raw: string | bigint, collateralDecimals: number, zchfDecimals: number = 18): string {
	const n = BigInt(raw.toString());
	const exp = zchfDecimals * 2 - collateralDecimals; // e.g. 18 for 18-dec, 28 for 8-dec, 36 for 0-dec
	const divisor = BigInt(10) ** BigInt(exp);
	const whole = n / divisor;
	const fracRaw = n % divisor;
	// scale fractional part to 6 display decimals
	const frac6 = (fracRaw * 1_000_000n) / divisor;
	return `${whole}.${frac6.toString().padStart(6, '0')}`;
}

async function main() {
	console.log('Fetching open V2 positions from API...');
	const positions = await fetchOpenPositions();
	console.log(`Found ${positions.length} open V2 positions\n`);

	const mismatches: Array<{
		position: Address;
		collateralSymbol: string;
		apiPrice: string;
		onchainPrice: string;
		diffPct: string;
	}> = [];

	const priceResults = await Promise.allSettled(
		positions.map((p) => fetchOnchainPrice(p.position))
	);

	console.log(`${'Position'.padEnd(44)} ${'Collateral'.padEnd(10)} ${'API Price'.padEnd(28)} ${'Onchain Price'.padEnd(28)} Diff`);
	console.log('─'.repeat(130));

	for (let i = 0; i < positions.length; i++) {
		const p = positions[i];
		const result = priceResults[i];

		if (result.status === 'rejected') {
			console.log(`${p.position}  ERROR: ${result.reason}`);
			continue;
		}

		const onchainPrice = result.value;
		const apiPrice = BigInt(p.price);

		const apiFormatted = formatPrice(apiPrice, p.collateralDecimals, p.zchfDecimals);
		const onchainFormatted = formatPrice(onchainPrice, p.collateralDecimals, p.zchfDecimals);

		const match = apiPrice === onchainPrice;

		// Calculate % difference
		let diffPct = '0.000%';
		if (apiPrice !== 0n && onchainPrice !== 0n && !match) {
			const diff = onchainPrice > apiPrice ? onchainPrice - apiPrice : apiPrice - onchainPrice;
			// multiply by 100_000 for 3 decimal places of precision
			const pct = (diff * 100_000n) / apiPrice;
			const pctWhole = pct / 1000n;
			const pctFrac = pct % 1000n;
			const sign = onchainPrice < apiPrice ? '-' : '+';
			diffPct = `${sign}${pctWhole}.${pctFrac.toString().padStart(3, '0')}%`;
		}

		const line = `${p.position}  ${p.collateralSymbol.padEnd(10)} ${apiFormatted.padEnd(28)} ${onchainFormatted.padEnd(28)} ${diffPct}`;

		if (!match) {
			console.log(`\x1b[33m${line}  <-- MISMATCH\x1b[0m`);
			mismatches.push({
				position: p.position,
				collateralSymbol: p.collateralSymbol,
				apiPrice: apiFormatted,
				onchainPrice: onchainFormatted,
				diffPct,
			});
		} else {
			console.log(line);
		}
	}

	console.log('\n' + '─'.repeat(130));
	console.log(`\nSummary: ${mismatches.length} mismatch(es) out of ${positions.length} positions`);

	if (mismatches.length > 0) {
		console.log('\nMismatched positions (API price != on-chain price):');
		for (const m of mismatches) {
			console.log(`  ${m.position}  ${m.collateralSymbol.padEnd(10)}  api=${m.apiPrice}  chain=${m.onchainPrice}  diff=${m.diffPct}`);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
