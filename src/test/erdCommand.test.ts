import * as assert from 'assert';
import * as vscode from 'vscode';

suite('prisma-visualizer.showERD', () => {
	test('is registered after activation', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('prisma-visualizer.showERD'));
	});

	test('opens a "Prisma ERD" webview panel without throwing', async () => {
		// The test harness runs with no workspace/schema.prisma present, so this exercises the
		// "schemaMissing" path — the point of this test is that panel creation and messaging
		// still succeed cleanly even then, not the diagram content itself (see
		// core/__tests__/graphBuilder.test.ts for parsing/rendering-data correctness, which
		// doesn't require a real VS Code instance).
		await vscode.commands.executeCommand('prisma-visualizer.showERD');

		const erdTab = vscode.window.tabGroups.all.flatMap((group) => group.tabs).find((tab) => tab.label === 'Prisma ERD');
		assert.ok(erdTab, 'expected a "Prisma ERD" tab to be open');
	});

	test('re-invoking the command reveals the existing panel instead of duplicating it', async () => {
		await vscode.commands.executeCommand('prisma-visualizer.showERD');
		await vscode.commands.executeCommand('prisma-visualizer.showERD');

		const erdTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.label === 'Prisma ERD');
		assert.strictEqual(erdTabs.length, 1);
	});
});
