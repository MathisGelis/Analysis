/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/test"],
  testRegex: ".*\\.spec\\.ts$",
  setupFiles: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1", "^@test/(.*)$": "<rootDir>/test/$1" },
  // sql.js charge son WASM : le 1er test de chaque fichier est un peu plus lent.
  testTimeout: 30000,
};
