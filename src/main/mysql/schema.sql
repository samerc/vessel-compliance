CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'admin' or 'user'
  theme_preference VARCHAR(10) DEFAULT 'dark', -- 'light' or 'dark'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fleets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vessels (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  imo_number VARCHAR(20) NOT NULL,
  fleet_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_types (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  required BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vessel_documents (
  id VARCHAR(36) PRIMARY KEY,
  vessel_id VARCHAR(36) NOT NULL,
  document_type_id VARCHAR(36) NOT NULL,
  file_path TEXT,
  sent BOOLEAN DEFAULT FALSE,
  required BOOLEAN DEFAULT FALSE,
  expiry_date DATE,
  received_date DATE,
  uploaded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by VARCHAR(255),
  FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entities (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'company' or 'person'
  identifier VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  passport_file_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assured_roles (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vessel_assureds (
  id VARCHAR(36) PRIMARY KEY,
  vessel_id VARCHAR(36) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  role VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entity_ubos (
  assured_entity_id VARCHAR(36) NOT NULL,
  ubo_entity_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assured_entity_id, ubo_entity_id),
  FOREIGN KEY (assured_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (ubo_entity_id) REFERENCES entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- P&I Quotation Settings Tables

CREATE TABLE IF NOT EXISTS pi_clauses (
  id VARCHAR(36) PRIMARY KEY,
  clause_number INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_cargo_related BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_clause_sets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_clause_set_items (
  id VARCHAR(36) PRIMARY KEY,
  set_id VARCHAR(36) NOT NULL,
  clause_id VARCHAR(36) NOT NULL,
  FOREIGN KEY (set_id) REFERENCES pi_clause_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (clause_id) REFERENCES pi_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_warranty_tags (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_warranties (
  id VARCHAR(36) PRIMARY KEY,
  text TEXT NOT NULL,
  is_cargo_related BOOLEAN DEFAULT FALSE,
  default_selected BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_warranty_tag_assignments (
  warranty_id VARCHAR(36) NOT NULL,
  tag_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (warranty_id, tag_id),
  FOREIGN KEY (warranty_id) REFERENCES pi_warranties(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES pi_warranty_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_warranty_sets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  default_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_warranty_set_items (
  id VARCHAR(36) PRIMARY KEY,
  set_id VARCHAR(36) NOT NULL,
  warranty_id VARCHAR(36) NOT NULL,
  FOREIGN KEY (set_id) REFERENCES pi_warranty_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (warranty_id) REFERENCES pi_warranties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_deductibles (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) DEFAULT '',
  description TEXT NOT NULL,
  default_amount DECIMAL(12,2) DEFAULT 0,
  default_currency VARCHAR(10) DEFAULT 'USD',
  has_secondary BOOLEAN DEFAULT FALSE,
  secondary_description TEXT,
  secondary_default_amount DECIMAL(12,2),
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_deductible_sets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_deductible_set_items (
  id VARCHAR(36) PRIMARY KEY,
  set_id VARCHAR(36) NOT NULL,
  deductible_id VARCHAR(36) NOT NULL,
  amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  secondary_amount DECIMAL(12,2),
  FOREIGN KEY (set_id) REFERENCES pi_deductible_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (deductible_id) REFERENCES pi_deductibles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_text_deductibles (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) DEFAULT '',
  text TEXT NOT NULL,
  default_included BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_exclusions (
  id VARCHAR(36) PRIMARY KEY,
  text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_sub_limit_templates (
  id VARCHAR(36) PRIMARY KEY,
  text_template TEXT NOT NULL,
  default_amount DECIMAL(12,2) DEFAULT 0,
  default_currency VARCHAR(10) DEFAULT 'USD',
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_additional_clauses (
  id VARCHAR(36) PRIMARY KEY,
  text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trading_excluded_countries (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  iso3_code VARCHAR(3) NOT NULL,
  list_type VARCHAR(20) NOT NULL DEFAULT 'excluded',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quotation Tables

CREATE TABLE IF NOT EXISTS quotations (
  id VARCHAR(36) PRIMARY KEY,
  reference_number VARCHAR(100),
  quotation_date DATE,
  policy_type_id VARCHAR(36),
  vessel_id VARCHAR(36),
  is_renewal BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'draft',
  period_text VARCHAR(255),
  limit_of_liability_amount DECIMAL(15,2),
  limit_of_liability_currency VARCHAR(10) DEFAULT 'USD',
  limit_of_liability_text TEXT,
  premium_amount DECIMAL(15,2),
  premium_currency VARCHAR(10) DEFAULT 'USD',
  num_instalments INT DEFAULT 1,
  trading_warranty_intro TEXT,
  sanctions_clause_version VARCHAR(50) DEFAULT 'standard',
  section_texts_override MEDIUMTEXT,
  sanctions_text_override TEXT,
  vdr_deductible_enabled BOOLEAN DEFAULT TRUE,
  deductible_aggregate_enabled BOOLEAN DEFAULT TRUE,
  deductible_aggregate_text TEXT,
  validity_days INT DEFAULT 14,
  premium_additional_text TEXT,
  ncb_enabled BOOLEAN DEFAULT FALSE,
  ncb_discount_percent DECIMAL(5,2),
  ncb_text TEXT,
  cpc_enabled BOOLEAN DEFAULT FALSE,
  cpc_discount_percent DECIMAL(5,2),
  cpc_text TEXT,
  discount_percent DECIMAL(5,2),
  discount_label VARCHAR(50),
  non_refundable_type VARCHAR(20) DEFAULT NULL,
  non_refundable_percent DECIMAL(5,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  FOREIGN KEY (policy_type_id) REFERENCES policy_types(id) ON DELETE SET NULL,
  FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_new_vessels (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  imo_number VARCHAR(20),
  built_year INT,
  gross_tonnage DECIMAL(12,2),
  flag VARCHAR(100),
  vessel_type VARCHAR(100),
  classification VARCHAR(100),
  call_sign VARCHAR(50),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_assureds (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  entity_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  order_index INT DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_sub_limits (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  text TEXT NOT NULL,
  amount DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_clauses (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_clause_id VARCHAR(36) NOT NULL,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (pi_clause_id) REFERENCES pi_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_additional_clauses (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_additional_clause_id VARCHAR(36),
  custom_text TEXT,
  order_index INT DEFAULT 0,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (pi_additional_clause_id) REFERENCES pi_additional_clauses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_warranties (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_warranty_id VARCHAR(36) NOT NULL,
  order_index INT DEFAULT 0,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (pi_warranty_id) REFERENCES pi_warranties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_custom_warranties (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_deductibles (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_deductible_id VARCHAR(36),
  title VARCHAR(255) DEFAULT '',
  description TEXT,
  amount DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  secondary_amount DECIMAL(15,2),
  secondary_description TEXT,
  order_index INT DEFAULT 0,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (pi_deductible_id) REFERENCES pi_deductibles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_text_deductibles (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_text_deductible_id VARCHAR(36),
  title VARCHAR(255) DEFAULT '',
  text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (pi_text_deductible_id) REFERENCES pi_text_deductibles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_exclusions (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_exclusion_id VARCHAR(36),
  custom_text TEXT,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (pi_exclusion_id) REFERENCES pi_exclusions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_excluded_countries (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  list_type VARCHAR(20) NOT NULL DEFAULT 'excluded',
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_subjectivities (
  id VARCHAR(36) PRIMARY KEY,
  text TEXT NOT NULL,
  order_index INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_subjectivity_doc_types (
  id VARCHAR(36) PRIMARY KEY,
  subjectivity_id VARCHAR(36) NOT NULL,
  doc_type_id VARCHAR(36) NOT NULL,
  FOREIGN KEY (subjectivity_id) REFERENCES pi_subjectivities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_subjectivities (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  pi_subjectivity_id VARCHAR(36),
  text TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT FALSE,
  is_auto_populated BOOLEAN DEFAULT FALSE,
  order_index INT DEFAULT 0,
  vessel_scope TEXT DEFAULT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_instalments (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  instalment_number INT NOT NULL,
  days_from_inception INT DEFAULT 0,
  description VARCHAR(255),
  non_refundable BOOLEAN DEFAULT FALSE,
  non_refundable_percent DECIMAL(5,2),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pi_sanctions_versions (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  key_name VARCHAR(50) NOT NULL UNIQUE,
  text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_information (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_notes (
  id VARCHAR(36) PRIMARY KEY,
  quotation_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  order_index INT DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
