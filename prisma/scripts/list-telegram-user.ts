#!/usr/bin/env ts-node
import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
	const groups = await prisma.telegramGroup.findMany({ orderBy: { createdAt: 'asc' } });

	console.log(`${groups.length} group(s)\n`);

	for (const g of groups) {
		console.log(g.chatId);
	}
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
