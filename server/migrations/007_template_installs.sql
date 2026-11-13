-- Migration: 007_template_installs
-- One row per (user, template) the first time a signed-in user installs a
-- marketplace template. The install route only bumps community_templates.downloads
-- when this insert actually adds a row, so repeat installs by the same user no
-- longer inflate the public download count / "popular" ranking.
-- user_id has no FK: signed-in users are not guaranteed a smartsht.users row.
CREATE TABLE IF NOT EXISTS smartsht.template_installs (
  user_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES smartsht.community_templates(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_id)
);
-- The PK leads with user_id, so the ON DELETE CASCADE lookup by template_id
-- needs its own index or a template delete scans every install row.
CREATE INDEX IF NOT EXISTS idx_template_installs_template
  ON smartsht.template_installs (template_id);
