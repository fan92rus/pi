import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../src/core/session-manager.ts";

function createSessionFile(dir: string, label: string): void {
	const session = SessionManager.create(dir, dir);
	session.appendMessage({ role: "user", content: label, timestamp: Date.now() });
	session.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: `reply to ${label}` }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
}

describe("SessionManager.listAll fast-path progress", () => {
	let agentDir: string;

	beforeEach(() => {
		agentDir = join(tmpdir(), `listall-progress-${Date.now()}`);
		mkdirSync(join(agentDir, "sessions", "proj-a"), { recursive: true });
		mkdirSync(join(agentDir, "sessions", "proj-b"), { recursive: true });
		vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		rmSync(agentDir, { recursive: true, force: true });
	});

	it("reports global progress across session directories in the fast path", async () => {
		createSessionFile(join(agentDir, "sessions", "proj-a"), "one");
		createSessionFile(join(agentDir, "sessions", "proj-b"), "two");

		const progress: Array<{ loaded: number; total: number }> = [];
		await SessionManager.listAll((loaded, total) => {
			progress.push({ loaded, total });
		});

		expect(progress.length).toBeGreaterThan(0);
		// The final progress event must report the total across BOTH
		// directories, not just the last directory's file count.
		const last = progress[progress.length - 1];
		expect(last.total).toBe(2);
		expect(last.loaded).toBe(2);
	});
});
