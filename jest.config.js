/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Requiere emulador Firestore — usar `npm run test:rules`
  testPathIgnorePatterns: ["<rootDir>/src/lib/__tests__/firestore-rules\\.test\\.ts$"],
  transform: {
    "^\.+\.(ts|tsx)$": "ts-jest",
  },
};

module.exports = config;
