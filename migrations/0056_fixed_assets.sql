CREATE TABLE IF NOT EXISTS fixed_assets (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL,
 asset_code TEXT NOT NULL,
 description TEXT NOT NULL,
 category TEXT NOT NULL,
 serial_number TEXT,
 purchase_date DATE,
 purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
 depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
 depreciation_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
 useful_life_years NUMERIC(8,2),
 current_value NUMERIC(14,2),
 location TEXT,
 custodian_staff_id BIGINT,
 status TEXT NOT NULL DEFAULT 'active',
 warranty_expiry DATE,
 amc_expiry DATE,
 notes TEXT,
 created_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(hospital_id,asset_code)
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_hospital_status ON fixed_assets(hospital_id,status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_hospital_category ON fixed_assets(hospital_id,category);
CREATE TABLE IF NOT EXISTS fixed_asset_transfers (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL,
 asset_id BIGINT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
 from_location TEXT,
 to_location TEXT,
 from_custodian_staff_id BIGINT,
 to_custodian_staff_id BIGINT,
 reason TEXT,
 transferred_by TEXT NOT NULL,
 transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_transfers_asset ON fixed_asset_transfers(hospital_id,asset_id,transferred_at DESC);

INSERT INTO permissions(permission_key,label,category,description)
VALUES ('action.assets.manage','Manage fixed assets','Actions','Create, update and transfer hospital fixed assets')
ON CONFLICT(permission_key) DO UPDATE SET label=EXCLUDED.label,category=EXCLUDED.category,description=EXCLUDED.description;
INSERT INTO role_permissions(role,permission_key,allowed)
SELECT r,'action.assets.manage',true FROM unnest(ARRAY['admin','store']) r
ON CONFLICT(role,permission_key) DO UPDATE SET allowed=true;