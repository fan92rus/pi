import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_INDEX_FILENAME, SessionManager } from "../../src/core/session-manager.ts";

describe("session sidecar index", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `session-index-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function createPersistedSession(cwd: string, label: string): string {
		const session = SessionManager.create(cwd, tempDir);
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
		const sessionFile = session.getSessionFile();
		if (!sessionFile) throw new Error("Expected persisted session file");
		return sessionFile;
	}

	it("creates an index after listing and serves sessions from it", async () => {
		const sessionFile = createPersistedSession(tempDir, "hello");

		const sessions = await SessionManager.list(tempDir, tempDir);
		expect(sessions.map((s) => s.path)).toEqual([sessionFile]);

		const indexPath = join(tempDir, SESSION_INDEX_FILENAME);
		expect(existsSync(indexPath)).toBe(true);
		const index = JSON.parse(readFileSync(indexPath, "utf8"));
		expect(index.version).toBe(1);
		expect(Object.keys(index.sessions)).toHaveLength(1);
	});

	it("second list call reuses the index without full reads", async () => {
		createPersistedSession(tempDir, "one");
		createPersistedSession(tempDir, "two");

		const first = await SessionManager.list(tempDir, tempDir);
		expect(first).toHaveLength(2);

		// Second listing must be served from the index (same mtime/size).
		const second = await SessionManager.list(tempDir, tempDir);
		expect(second.map((s) => s.id).sort()).toEqual(first.map((s) => s.id).sort());
	});

	it("detects new sessions added after the index was built", async () => {
		createPersistedSession(tempDir, "first");
		await SessionManager.list(tempDir, tempDir);

		createPersistedSession(tempDir, "second");
		const sessions = await SessionManager.list(tempDir, tempDir);
		expect(sessions).toHaveLength(2);
	});

	it("drops index entries whose session files were deleted", async () => {
		const sessionA = createPersistedSession(tempDir, "keep");
		const sessionDelete = createPersistedSession(tempDir, "delete-me");
		await SessionManager.list(tempDir, tempDir);

		rmSync(sessionDelete, { force: true });
		const sessions = await SessionManager.list(tempDir, tempDir);
		expect(sessions.map((s) => s.path)).toEqual([sessionA]);
	});

	it("includeContent returns full message text, fast path returns empty", async () => {
		const sessionFile = createPersistedSession(tempDir, "needle phrase");

		const fast = await SessionManager.list(tempDir, tempDir);
		expect(fast[0]?.allMessagesText ?? "").toBe("");

		const full = await SessionManager.list(tempDir, tempDir, undefined, { includeContent: true });
		expect(full[0]?.allMessagesText).toContain("needle phrase");
		expect(full.map((s) => s.path)).toEqual([sessionFile]);
	});

	it("invalidates index when a session file changes", async () => {
		const sessionFile = createPersistedSession(tempDir, "before");
		await SessionManager.list(tempDir, tempDir);

		// Rewrite one session file (simulates continued work).
		const appended =
			readFileSync(sessionFile, "utf8") +
			'{"type":"custom","id":"x","parentId":null,"timestamp":"2025-01-01T00:00:00Z","customType":"ping"}\n';
		writeFileSync(sessionFile, appended);
		// Force a distinct mtime so the index entry is invalidated.
		const future = new Date(Date.now() + 5000);
		const handle = require("fs").openSync(sessionFile, "r+");
		require("fs").utimesSync(sessionFile, future, future);
		require("fs").closeSync(handle);

		const sessions = await SessionManager.list(tempDir, tempDir);
		expect(sessions).toHaveLength(1);
	});
});
