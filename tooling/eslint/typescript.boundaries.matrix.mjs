export default {
  app: {
    allow: ['shared', 'workflows', 'infra', 'platform', 'provider'],
    denyReason: 'apps may depend only on shared, workflows, infra, platform, and provider packages',
  },
  domain: {
    allow: ['shared'],
    denyReason: 'domain may depend only on shared packages',
  },
  workflows: {
    allow: ['shared', 'domain', 'platform', 'provider'],
    denyReason: 'workflows may depend only on shared, domain, platform, and provider packages',
  },
  infra: {
    allow: ['shared', 'domain', 'platform', 'provider'],
    denyReason: 'infra may depend only on shared, domain, platform, and provider packages',
  },
  platform: {
    allow: ['shared'],
    denyReason: 'platform may depend only on shared packages',
  },
  provider: {
    allow: ['shared'],
    denyReason: 'provider may depend only on shared packages',
  },
  migrations: {
    allow: ['shared', 'platform'],
    denyReason: 'migrations may depend only on shared and platform packages',
  },
  shared: {
    allow: ['shared'],
    denyReason: 'shared packages may depend only on other shared packages',
  },
}
