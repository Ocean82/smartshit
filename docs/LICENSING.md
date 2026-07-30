# Licensing — resolved

**Status:** resolved (2026-07).
**Original issue:** `docs/repo-assessment-2026-07-24.md`, item P2-2.

---

## Summary

The project previously used **HyperFormula** (dual-licensed: proprietary or GPL-3.0-only),
instantiated with `licenseKey: 'gpl-v3'`. This created a GPLv3 copyleft obligation
incompatible with the project's MIT license.

## Resolution

The formula engine was replaced with **[@ocean8219/formualizer](https://github.com/Ocean82/formualizer)** —
a permissively-licensed fork maintained by Ocean82. The package is published as
`@ocean8219/formualizer` on npm and used under a license compatible with MIT.

**No licensing conflict remains.** The project is correctly MIT-licensed throughout.

---

## Also worth noting: `xlsx`

`xlsx` is now installed from the SheetJS CDN (`xlsx-0.19.3`), which addresses
the prototype-pollution advisory (GHSA-4r6h-8v6p-xvw6). The ReDoS advisory
(GHSA-5pgg-2g8v-p4x9, fixed in `>=0.20.2`) may still apply — consider upgrading
to `0.20.3+` from the CDN when available, or migrating to `exceljs` (MIT).
