const { readFileSync, writeFileSync } = require("fs");

const README_PATH = "README.md";
const MANIFEST_PATH = "manifest.json";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function replaceMarkerSection(readme, marker, value) {
  const pattern = new RegExp(
    `<!-- ${marker}_START -->[\\s\\S]*?<!-- ${marker}_END -->`,
    "g",
  );

  return readme.replace(
    pattern,
    `<!-- ${marker}_START -->\`${value}\`<!-- ${marker}_END -->`,
  );
}

module.exports = {
  prepare(_, context) {
    const manifest = readJson(MANIFEST_PATH);
    const stableVersion = String(manifest.version).replace(/-beta\.\d+$/, "");
    const betaVersion = `${stableVersion}-beta.1`;

    let readme = readFileSync(README_PATH, "utf8");
    readme = replaceMarkerSection(readme, "README_STABLE_VERSION_EXAMPLE", stableVersion);
    readme = replaceMarkerSection(readme, "README_BETA_VERSION_EXAMPLE", betaVersion);
    writeFileSync(README_PATH, readme);

    context.logger.log(
      "Updated README release examples: stable=%s beta=%s",
      stableVersion,
      betaVersion,
    );
  },
};
