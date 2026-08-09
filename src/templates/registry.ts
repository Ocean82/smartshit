import type { TemplateSpec } from './types';
import { coreTemplates } from './core';
import { personalFinanceTemplates } from './personal-finance';
import { freelancerTemplates } from './freelancer';
import { realEstateTemplates } from './real-estate';
import { smallBusinessOpsTemplates } from './small-business-ops';
import { smallBusinessSalesTemplates } from './small-business-sales';
import { smallBusinessAccountingTemplates } from './small-business-accounting';
import { educationTemplates } from './education';
import { healthTemplates } from './health';
import { projectManagementTemplates } from './project-management';
import { nonprofitTemplates } from './nonprofit';
import { legalComplianceTemplates } from './legal-compliance';
import { saasDemoTemplates } from './saas-demo';

export const ALL_TEMPLATE_SPECS: TemplateSpec[] = [
  ...coreTemplates,
  ...personalFinanceTemplates,
  ...freelancerTemplates,
  ...realEstateTemplates,
  ...smallBusinessOpsTemplates,
  ...smallBusinessSalesTemplates,
  ...smallBusinessAccountingTemplates,
  ...educationTemplates,
  ...healthTemplates,
  ...projectManagementTemplates,
  ...nonprofitTemplates,
  ...legalComplianceTemplates,
  ...saasDemoTemplates,
];

/** Declarative template specs keyed by tool name. */
export const TEMPLATE_SPECS: Record<string, TemplateSpec> = Object.fromEntries(
  ALL_TEMPLATE_SPECS.map((spec) => [spec.tool, spec]),
);
