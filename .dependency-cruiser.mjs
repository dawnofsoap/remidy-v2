// Enforces the dependency directions in docs/BUILDING-FEATURES.md.
// tooling/rule-tests proves each rule fires, so edit both together.

const notATest = '\\.test\\.tsx?$';

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Import cycles are not allowed.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-not-to-features',
      comment: 'core is the base and must not know about features.',
      severity: 'error',
      from: { path: '(^|/)apps/[^/]+/src/core/' },
      to: { path: '(^|/)apps/[^/]+/src/features/' },
    },
    {
      name: 'ui-not-to-features',
      comment: 'The UI kit must not know about features.',
      severity: 'error',
      from: { path: '(^|/)apps/web/src/ui/' },
      to: { path: '(^|/)apps/web/src/features/' },
    },
    {
      name: 'feature-public-interface',
      comment: 'Import another feature only through its index.ts.',
      severity: 'error',
      from: { path: '(^|/)apps/[^/]+/src/features/([^/]+)/' },
      to: {
        path: '(^|/)apps/[^/]+/src/features/[^/]+/',
        pathNot: ['/features/$2/', '/features/[^/]+/index\\.tsx?$'],
      },
    },
    {
      name: 'packages-not-to-apps',
      comment: 'Shared packages must not depend on apps.',
      severity: 'error',
      from: { path: '(^|/)packages/' },
      to: { path: '(^|/)apps/' },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain holds pure logic: no I/O, Node built-ins or other packages.',
      severity: 'error',
      from: { path: '(^|/)packages/domain/', pathNot: notATest },
      to: { pathNot: ['(^|/)packages/domain/', '(^|/)node_modules/.*temporal'] },
    },
    {
      name: 'contracts-stay-shared',
      comment: 'contracts runs in the browser and server, so it uses only domain and zod.',
      severity: 'error',
      from: { path: '(^|/)packages/contracts/', pathNot: notATest },
      to: {
        pathNot: ['(^|/)packages/(contracts|domain)/', '(^|/)node_modules/(zod/|.*/zod/)'],
      },
    },
    {
      name: 'db-access-only-from-repos',
      comment: 'Only repo.ts files and server core may use the database package.',
      severity: 'error',
      from: {
        pathNot: [
          '(^|/)packages/db/',
          '(^|/)apps/server/src/core/',
          '(^|/)apps/server/src/main\\.ts$',
          '(^|/)apps/server/src/features/[^/]+/repo\\.ts$',
        ],
      },
      to: { path: '(^|/)packages/db/' },
    },
    {
      name: 'db-driver-only-in-db-package',
      comment: 'Only packages/db may talk to the database driver.',
      severity: 'error',
      from: { pathNot: '(^|/)packages/db/' },
      to: { path: '(^|/)node_modules/(pg/|.*/pg/)' },
    },
    {
      name: 'web-not-to-server',
      comment: 'The web app talks to the server over HTTP, through contracts.',
      severity: 'error',
      from: { path: '(^|/)apps/web/' },
      to: { path: '(^|/)apps/server/' },
    },
    {
      name: 'server-not-to-web',
      severity: 'error',
      from: { path: '(^|/)apps/server/' },
      to: { path: '(^|/)apps/web/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs'],
    },
  },
};
