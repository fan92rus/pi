import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function readJson(relPath: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(repoRoot, relPath), "utf8")) as Record<string, unknown>;
}

describe("coding-agent package metadata sync", () => {
	it("npm-shrinkwrap.json top-level version matches package.json", () => {
		const pkg = readJson("packages/coding-agent/package.json");
		const sw = readJson("packages/coding-agent/npm-shrinkwrap.json");
		expect(sw.version).toBe(pkg.version);
		expect((sw.packages as Record<string, { version?: string }>)[""].version).toBe(pkg.version);
	});

	it("npm-shrinkwrap.json undici matches package.json and root package-lock.json", () => {
		const pkg = readJson("packages/coding-agent/package.json");
		const sw = readJson("packages/coding-agent/npm-shrinkwrap.json");
		const lock = readJson("package-lock.json");

		const declared = (pkg.dependencies as Record<string, string>).undici;
		const resolvedSw = (sw.packages as Record<string, { version?: string }>)["node_modules/undici"].version;
		const resolvedLock = (lock.packages as Record<string, { version?: string }>)["node_modules/undici"].version;

		expect(resolvedSw).toBe(declared);
		expect(resolvedLock).toBe(declared);
	});
});
