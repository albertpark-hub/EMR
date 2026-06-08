-- =====================================================
-- thynC EMR — DB 스키마
-- MySQL 8.0+ / PostgreSQL 14+ 호환
-- =====================================================

-- 사용자
CREATE TABLE users (
  id            VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  name          VARCHAR(100) NOT NULL,
  assignee_label VARCHAR(100),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','manager','hospital','member') NOT NULL DEFAULT 'member',
  color         VARCHAR(7)   NOT NULL DEFAULT '#1A56DB',
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login    DATETIME,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 판매처 그룹
CREATE TABLE groups_ (
  id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  label      VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#1A56DB',
  icon       VARCHAR(50)  NOT NULL DEFAULT 'ti-tag',
  sort_order INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 파이프라인 단계
CREATE TABLE stages (
  id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  label      VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#94A3B8',
  bg_color   VARCHAR(7)   NOT NULL DEFAULT '#F1F5F9',
  text_color VARCHAR(7)   NOT NULL DEFAULT '#475569',
  sort_order INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 거래처
CREATE TABLE deals (
  id           VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  name         VARCHAR(200) NOT NULL,
  emr_vendor   VARCHAR(200),
  contact      VARCHAR(100),
  phone        VARCHAR(50),
  email        VARCHAR(255),
  assignee_id  VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  group_id     VARCHAR(36)  REFERENCES groups_(id) ON DELETE SET NULL,
  stage_id     VARCHAR(36)  REFERENCES stages(id) ON DELETE SET NULL,
  deadline     DATE,
  note         TEXT,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 이력
CREATE TABLE deal_history (
  id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  deal_id    VARCHAR(36)  NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id    VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  type       ENUM('reg','stage','deadline','note') NOT NULL DEFAULT 'note',
  text       TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_deals_assignee  ON deals(assignee_id);
CREATE INDEX idx_deals_stage     ON deals(stage_id);
CREATE INDEX idx_deals_group     ON deals(group_id);
CREATE INDEX idx_deal_history    ON deal_history(deal_id);

-- ── 기본 데이터 ──────────────────────────────────────────────────────────────

-- 단계
INSERT INTO stages (id, label, color, bg_color, text_color, sort_order) VALUES
  ('st1', '연동요청', '#94A3B8', '#F1F5F9', '#475569', 0),
  ('st2', '견적',    '#3B82F6', '#EFF6FF', '#1D4ED8', 1),
  ('st3', '발주',    '#F59E0B', '#FFFBEB', '#92400E', 2),
  ('st4', '연동 개발','#EC4899', '#FDF2F8', '#9D174D', 3),
  ('st5', '연동 완료','#22C55E', '#F0FDF4', '#166534', 4);

-- 그룹
INSERT INTO groups_ (id, label, color, icon, sort_order) VALUES
  ('g1', '연동 준비', '#7C3AED', 'ti-loader',  0),
  ('g2', '연동 진행', '#0D9488', 'ti-rocket',  1),
  ('g3', '유지/갱신', '#D97706', 'ti-refresh', 2);

-- 관리자 계정 (비밀번호: 1234 → bcrypt)
INSERT INTO users (id, name, assignee_label, email, password_hash, role, color) VALUES
  ('u1', '관리자', '관리자', 'admin@company.com',
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', -- 1234
   'admin', '#1A56DB');
