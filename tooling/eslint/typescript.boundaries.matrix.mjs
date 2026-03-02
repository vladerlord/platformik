export default {
  app: {
    allow: ["bounded:workflows", "bounded:infra", "shared:lib", "shared:infra", "shared:platform"],
    denyReason:
      "apps may depend on workflows/infra and shared lib/infra/platform only; apps must not import domain or migrations"
  },
  "bounded:domain": {
    allow: ["shared:lib"],
    denyReason: "domain may depend only on lib-* (and itself)"
  },
  "bounded:workflows": {
    allow: ["bounded:domain", "shared:lib", "shared:infra", "shared:platform"],
    crossContextAllowedTo: ["bounded:domain"],
    denyReason: "workflows may depend only on domain, lib-*, infra-* and platform-* (and itself)"
  },
  "bounded:infra": {
    allow: ["bounded:domain", "shared:lib", "shared:infra"],
    requireSameContextTo: ["bounded:domain"],
    denyReason: "infra may depend only on its own domain, lib-* and infra-* (and itself)"
  },
  "bounded:migrations": {
    allow: ["shared:lib", "shared:infra"],
    denyReason: "migrations may depend only on lib-* and infra-* (and itself)"
  },
  "shared:lib": {
    allow: ["shared:lib"],
    denyReason: "lib-* may depend only on lib-* (and itself)"
  },
  "shared:infra": {
    allow: ["shared:lib", "shared:infra"],
    denyReason: "infra-* may depend only on lib-* and infra-* (and itself)"
  },
  "shared:platform": {
    allow: ["shared:lib", "shared:infra"],
    denyReason: "platform-* may depend only on lib-* and infra-* (and itself)"
  }
};
