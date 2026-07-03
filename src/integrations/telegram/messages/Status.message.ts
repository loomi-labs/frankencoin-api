import { AppUrl } from 'utils/func-helper';

export function StatusMessage(chatId: string | number, governance: boolean, allPositions: boolean, owners: string[]): string {
	const lines: string[] = [`📋 *Subscriptions* (\`${chatId}\`)\n`];

	lines.push(`🏛 Governance: ${governance ? '✅' : '❌'}`);
	lines.push(`📊 All Positions: ${allPositions ? '✅' : '❌'}`);

	if (owners.length > 0) {
		lines.push(`\n👤 *Tracked Owners:*`);
		for (const addr of owners) {
			lines.push(`• \`${addr}\``);
		}
	} else {
		lines.push(`👤 Owners: none`);
	}

	lines.push(`\nv${process.env.npm_package_version} · [🌐 App](${AppUrl('')})`);
	return lines.join('\n');
}
