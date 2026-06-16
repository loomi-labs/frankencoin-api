import { AppUrl } from 'utils/func-helper';

export function WelcomeGroupMessage(group: string | number): string {
	return `👋 *Welcome to Frankencoin Bot*

This chat (\`${group}\`) is now connected to the Frankencoin ecosystem.

Link this chat in the [🔗 Link](${AppUrl('/monitoring/telegram')}) to enable personalized alerts.

v${process.env.npm_package_version} · [🌐 App](${AppUrl('')}) · [📦 GitHub](https://github.com/Frankencoin-ZCHF/frankencoin-api)`;
}
