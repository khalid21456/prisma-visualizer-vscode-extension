import * as assert from 'assert';
import * as vscode from 'vscode';

function findErdTabs(): vscode.Tab[] {
	return vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.label === 'Prisma ERD');
}

// Tab-group state can lag slightly behind executeCommand's returned promise (webview panel
// creation is reflected asynchronously), so poll briefly instead of checking synchronously.
async function waitForErdTabCount(expected: number, timeoutMs = 2000): Promise<vscode.Tab[]> {
	const deadline = Date.now() + timeoutMs;
	let tabs = findErdTabs();
	while (tabs.length !== expected && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		tabs = findErdTabs();
	}
	return tabs;
}

suite('prisma-visualizer.showERD', () => {
	// getCommands(true) only reliably includes a contributed command once the extension has
	// activated — without this, "is registered" is a race against VS Code's own startup, since
	// activationEvents is empty (the command's implicit "onCommand" activation only fires once
	// something actually invokes it, which the other two tests do incidentally).
	suiteSetup(async function () {
		this.timeout(10000);
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'prisma-visualizer');
		await ext?.activate();
	});

	test('is registered after activation', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('prisma-visualizer.showERD'));
	});

	test('opens a "Prisma ERD" webview panel without throwing', async function () {
		this.timeout(5000);
		// The test harness runs with no workspace/schema.prisma present, so this exercises the
		// "schemaMissing" path — the point of this test is that panel creation and messaging
		// still succeed cleanly even then, not the diagram content itself (see
		// core/__tests__/graphBuilder.test.ts for parsing/rendering-data correctness, which
		// doesn't require a real VS Code instance).
		await vscode.commands.executeCommand('prisma-visualizer.showERD');

		const tabs = await waitForErdTabCount(1);
		assert.strictEqual(tabs.length, 1, 'expected a single "Prisma ERD" tab to be open');
	});

	test('re-invoking the command reveals the existing panel instead of duplicating it', async function () {
		this.timeout(5000);
		await vscode.commands.executeCommand('prisma-visualizer.showERD');
		await waitForErdTabCount(1);
		await vscode.commands.executeCommand('prisma-visualizer.showERD');

		const tabs = await waitForErdTabCount(1);
		assert.strictEqual(tabs.length, 1);
	});
});
