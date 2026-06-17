#!/usr/bin/env ts-node
/**
 * Verify supply consistency using BigInt throughout — no rounding errors.
 *
 * Identity: positions minted + bridge minted + accrued losses = total supply (all chains)
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/verify-supply.ts
 *   API_URL=http://localhost:3000 ts-node -r tsconfig-paths/register scripts/verify-supply.ts
 */

import { ApiPositionsMapping, PositionQuery } from 'modules/positions/positions.types';
import { ADDRESS, BridgedFrankencoinABI, ERC20ABI, FrankencoinABI, StablecoinBridgeV2ABI, SupportedChainIds } from '@frankencoin/zchf';
import { VIEM_CONFIG } from 'app.config';
import { Address, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';

const API_URL = process.env.API_URL ?? 'https://api.frankencoin.com';

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPositionsOpen(): Promise<PositionQuery[]> {
	const res = await fetch(`${API_URL}/positions/open`);
	if (!res.ok) throw new Error(`positions/open: ${res.status} ${res.statusText}`);
	const data: ApiPositionsMapping = await res.json();
	return Object.values(data.map) as PositionQuery[];
}

async function fetchChainSupplies(): Promise<{ chainId: number; supply: bigint }[]> {
	const sidechains = SupportedChainIds.filter(
		(id) => id !== mainnet.id && (ADDRESS[id] as any)?.ccipBridgedFrankencoin && VIEM_CONFIG[id]
	);

	const [mainnetSupply, ...sidechainSupplies] = await Promise.all([
		VIEM_CONFIG[mainnet.id].readContract({
			address: ADDRESS[mainnet.id].frankencoin,
			abi: FrankencoinABI,
			functionName: 'totalSupply',
		}) as Promise<bigint>,
		...sidechains.map(
			(id) =>
				VIEM_CONFIG[id].readContract({
					address: (ADDRESS[id] as any).ccipBridgedFrankencoin as Address,
					abi: ERC20ABI,
					functionName: 'totalSupply',
				}) as Promise<bigint>
		),
	]);

	return [{ chainId: mainnet.id, supply: mainnetSupply }, ...sidechains.map((id, i) => ({ chainId: id, supply: sidechainSupplies[i] }))];
}

async function fetchAccruedLosses(): Promise<{ chainId: number; accruedLoss: bigint }[]> {
	const sidechains = SupportedChainIds.filter(
		(id) => id !== mainnet.id && (ADDRESS[id] as any)?.ccipBridgedFrankencoin && VIEM_CONFIG[id]
	);

	return Promise.all(
		sidechains.map(async (id) => ({
			chainId: id,
			accruedLoss: (await VIEM_CONFIG[id].readContract({
				address: (ADDRESS[id] as any).ccipBridgedFrankencoin as Address,
				abi: BridgedFrankencoinABI,
				functionName: 'accruedLoss',
			})) as bigint,
		}))
	);
}

async function fetchBridgeMinted(): Promise<bigint> {
	return VIEM_CONFIG[mainnet.id].readContract({
		address: ADDRESS[mainnet.id].stablecoinBridgeCHFAU as Address,
		abi: StablecoinBridgeV2ABI,
		functionName: 'minted',
	}) as Promise<bigint>;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const fmtZ = (raw: bigint) => Number(formatUnits(raw, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });
const fmtDiff = (diff: bigint, base: bigint) => {
	const sign = diff >= 0n ? '+' : '-';
	const absDiff = diff < 0n ? -diff : diff;
	const ppm = base > 0n ? (absDiff * 1_000_000n) / base : 0n;
	return `${sign}${fmtZ(absDiff)} ZCHF (${sign}${Number(ppm) / 10000}%)`;
};
const check = (label: string, ok: boolean) => `${ok ? '✅' : '❌'} ${label}`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log(`\nFetching from ${API_URL} + on-chain ...\n`);

	const [positions, chainSupplies, accruedLosses, bridgeMinted] = await Promise.all([
		fetchPositionsOpen(),
		fetchChainSupplies(),
		fetchAccruedLosses(),
		fetchBridgeMinted(),
	]);

	// ── Positions ─────────────────────────────────────────────────────────────
	let positionsMinted = 0n;
	for (const p of positions) positionsMinted += BigInt(p.minted);

	// ── Total supply (all chains) ─────────────────────────────────────────────
	let totalSupply = 0n;
	for (const { supply } of chainSupplies) totalSupply += supply;

	// ── Accrued losses (sidechain ZCHF) ──────────────────────────────────────
	let totalAccruedLoss = 0n;
	for (const { accruedLoss } of accruedLosses) totalAccruedLoss += accruedLoss;

	// ── Print ─────────────────────────────────────────────────────────────────
	console.log('═══════════════════════════════════════════════════════');
	console.log('  SUPPLY VERIFICATION');
	console.log('═══════════════════════════════════════════════════════\n');

	console.log('── Positions (mainnet) ─────────────────────────────────');
	console.log(`  Open positions:   ${positions.length}`);
	console.log(`  Minted (sum):     ${fmtZ(positionsMinted)} ZCHF\n`);

	console.log('── Stablecoin Bridge (mainnet, on-chain) ───────────────');
	console.log(`  CHFAU bridge:     ${fmtZ(bridgeMinted)} ZCHF\n`);

	console.log('── Total Supply (on-chain per chain) ───────────────────');
	for (const { chainId, supply } of chainSupplies) {
		console.log(`  Chain ${String(chainId).padEnd(10)} supply: ${fmtZ(supply).padStart(20)} ZCHF`);
	}
	console.log(`  ${'TOTAL'.padEnd(16)} supply: ${fmtZ(totalSupply).padStart(20)} ZCHF\n`);

	console.log('── Accrued Loss (ZCHF minted on sidechains) ────');
	for (const { chainId, accruedLoss } of accruedLosses) {
		if (accruedLoss === 0n) continue;
		console.log(`  Chain ${String(chainId).padEnd(10)} loss:   ${fmtZ(accruedLoss).padStart(20)} ZCHF`);
	}
	console.log(`  ${'TOTAL'.padEnd(16)} loss:   ${fmtZ(totalAccruedLoss).padStart(20)} ZCHF\n`);

	// ── Checks ────────────────────────────────────────────────────────────────
	// identity: positions + bridge + accrued losses = total supply (all chains)
	const lhs = positionsMinted + bridgeMinted + totalAccruedLoss;
	const diff = totalSupply - lhs;
	const TOLERANCE = totalSupply / 1000n; // 0.1%
	const ok = diff >= -TOLERANCE && diff <= TOLERANCE;

	console.log('── Check ───────────────────────────────────────────────');
	console.log(`  positions + bridge + accrued loss = ${fmtZ(lhs)} ZCHF`);
	console.log(`  total supply                      = ${fmtZ(totalSupply)} ZCHF`);
	console.log(`  ${check(`diff: ${fmtDiff(diff, totalSupply)}`, ok)}`);
	console.log();
}

main().catch((err) => {
	console.error('Error:', err.message);
	process.exit(1);
});
