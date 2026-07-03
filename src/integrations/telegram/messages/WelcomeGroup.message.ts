import { AppUrl } from 'utils/func-helper';

export function WelcomeGroupMessage(group: string | number): string {
	return `👋 *Welcome to Frankencoin Bot*

<<<<<<< HEAD
This chat (\`${group}\`) is now connected to the Frankencoin ecosystem.

Link this chat in the [🔗 Link](${AppUrl('/monitoring/telegram')}) to enable personalized alerts.
=======
This chat (\`${group}\`) is connected to the Frankencoin ecosystem.

*/start* — Subscribe to all alerts (Governance + All Positions)
*/start GOV* | */stop GOV* — Toggle Governance alerts
*/start ALL* | */stop ALL* — Toggle All Positions alerts
*/start <owner>* — Subscribe to Governance + track an owner
*/stop <owner>* — Stop tracking an owner
*/status* — Show your active subscriptions
*/help* — Show this message again
>>>>>>> upstream/main

v${process.env.npm_package_version} · [🌐 App](${AppUrl('')}) · [📦 GitHub](https://github.com/Frankencoin-ZCHF/frankencoin-api)`;
}
