/**
 * Suite de integración financiera contra el emulador de Firestore.
 * No se ejecuta con `npm test`: se lanza vía `npm run test:integration`,
 * que arranca el emulador y define FIRESTORE_EMULATOR_HOST.
 *
 * @type {import('jest').Config}
 */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/lib/__tests__/integration/**/*.test.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  // Las transacciones bajo contención reintentan: dales margen.
  testTimeout: 60000,
};

module.exports = config;
