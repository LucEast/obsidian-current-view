import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
const isPreRelease = targetVersion.includes("-");

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;

if (isPreRelease) {
	console.log(`Pre-release detected (${targetVersion}): skipping manifest.json and versions.json`);
} else {
	manifest.version = targetVersion;
	writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

	const versions = JSON.parse(readFileSync("versions.json", "utf8"));
	versions[targetVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
}
