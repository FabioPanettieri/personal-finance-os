import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-restricted-syntax': [
        'error',
        {
          // Security Model: nessuna registrazione pubblica. Gli utenti si creano solo da Supabase.
          selector: "MemberExpression[property.name='signUp']",
          message: 'La registrazione pubblica è disattivata (docs/02-security.md).',
        },
      ],
    },
  },
  {
    // La logica pura non dipende da React, Next.js, Supabase o dal server.
    files: ['lib/**/*.ts'],
    ignores: ['lib/navigation.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'next', 'next/*'], message: 'lib/ contiene solo logica pura.' },
            { group: ['@supabase/*'], message: 'Accesso ai dati solo in server/.' },
            { group: ['@/server/*', '@/features/*', '@/components/*', '@/app/*'], message: 'lib/ non dipende dagli altri livelli.' },
          ],
        },
      ],
    },
  },
  {
    // I componenti UI non conoscono dati, server o feature.
    files: ['components/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/server/*', '@/features/*', '@supabase/*'], message: 'components/ui è presentazionale.' }] },
      ],
    },
  },
  {
    // Server di test da riga di comando: il log di avvio è voluto.
    files: ['tests/e2e/**/*.mjs', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores(['.next/**', '.next-e2e/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**']),
])
