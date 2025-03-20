module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/app'],
  moduleNameMapper: {
    '^App/(.*)$': '<rootDir>/app/$1',
    '^Config/(.*)$': '<rootDir>/config/$1'
  },
  collectCoverage: false,
  collectCoverageFrom: ['app/**/*.ts', '!app/**/*.d.ts', '!app/**/__tests__/**'],
  coverageDirectory: 'coverage',
  testMatch: ['**/__tests__/**/*.test.ts', '**/test/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json'
      }
    ]
  }
}
