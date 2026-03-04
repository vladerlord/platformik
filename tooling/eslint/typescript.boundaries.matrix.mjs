export default {
  app: {
    allow: ['lib', 'domain', 'ports', 'contracts', 'module', 'workflows', 'adapter', 'runtime', 'vendor'],
    denyReason: 'apps may only import lib, domain, ports, contracts, module, workflows, adapter, runtime, and vendor',
  },
  lib: {
    allow: ['lib'],
    denyReason: 'lib packages may only depend on other lib packages (no IO, no SDKs, no domain concepts)',
  },
  domain: {
    allow: ['lib'],
    denyReason: 'domain packages may only depend on lib (pure model: no ports, no IO, no adapters)',
  },
  ports: {
    allow: ['lib', 'domain'],
    denyReason: 'ports packages may only depend on lib and domain (interfaces reference domain entity types)',
  },
  contracts: {
    allow: ['lib'],
    denyReason: 'contracts packages may only depend on lib (wire-format schemas; no domain logic)',
  },
  module: {
    allow: ['lib', 'domain', 'ports', 'contracts'],
    denyReason:
      'module packages may only depend on lib, domain, ports, and contracts (use factory injection for runtime/vendor)',
  },
  workflows: {
    allow: ['lib', 'ports', 'contracts', 'runtime'],
    denyReason:
      'workflows packages may only depend on lib, ports, contracts, and runtime (orchestration via port interfaces)',
  },
  adapter: {
    allow: ['lib', 'domain', 'ports', 'runtime', 'vendor'],
    denyReason: 'adapter packages may only depend on lib, domain, ports, runtime, and vendor',
  },
  runtime: {
    allow: ['lib'],
    denyReason: 'runtime packages may only depend on lib (no domain, no vendor coupling)',
  },
  vendor: {
    allow: ['lib'],
    denyReason: 'vendor packages may only depend on lib (thin wrappers; no domain, no runtime)',
  },
  migrations: {
    allow: ['lib', 'runtime'],
    denyReason: 'migrations may only depend on lib and runtime (schema-level, independent of domain code)',
  },
  testkit: {
    allow: ['lib', 'domain', 'ports', 'module'],
    denyReason:
      'testkit packages may only depend on lib, domain, ports, and module (test factories, in-memory port implementations, module test doubles)',
  },
}
