import { AppUrl } from 'utils/func-helper';

export function HelpMessage(group: string | number): string {
	return `ℹ️ *Frankencoin Bot*

Monitoring the Frankencoin ecosystem. (\`${group}\`)

Configure notifications and alert preferences in the [🔗 Link](${AppUrl('/monitoring/telegram')}).
Use /sessions to view and manage linked app sessions.

v${process.env.npm_package_version} · [🌐 App](${AppUrl('')}) · [📦 GitHub](https://github.com/Frankencoin-ZCHF/frankencoin-api)`;
}
