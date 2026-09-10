/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Requieren emulador Firestore — usar `npm run test:rules` / `npm run test:integration`
  testPathIgnorePatterns: [
    "<rootDir>/src/lib/__tests__/firestore-rules\\.test\\.ts$",
    "<rootDir>/src/lib/__tests__/integration/",
  ],
  transform: {
    "^\.+\.(ts|tsx)$": "ts-jest",
  },
};

module.exports = config;
