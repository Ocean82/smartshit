import type { TemplateSpec } from './types';
import { coreTemplates } from './core';
import { personalFinanceTemplates } from './personal-finance';
import { freelancerTemplates } from './freelancer';
import { realEstateTemplates } from './real-estate';
import { smallBusinessTemplates } from './small-business';
import { educationTemplates } from './education';
import { healthTemplates } from './health';
import { saasDemoTemplates } from './saas-demo';

export const ALL_TEMPLATE_SPECS: TemplateSpec[] = [
  ...coreTemplates,
  ...personalFinanceTemplates,
  ...freelancerTemplates,
  ...realEstateTemplates,
  ...smallBusinessTemplates,
  ...educationTemplates,
  ...healthTemplates,
  ...saasDemoTemplates,
];

/** Declarative template specs keyed by tool name. */
export const TEMPLATE_SPECS: Record<string, TemplateSpec> = Object.fromEntries(
  ALL_TEMPLATE_SPECS.map((spec) => [spec.tool, spec]),
);
