import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database;

export function getDatabase(): Database.Database {
  return db;
}

export function initDatabase(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  createTables();
  return db;
}

function createTables() {
  db.exec(`
    -- ── Sync metadata ──
    CREATE TABLE IF NOT EXISTS _sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- ── Change log for offline tracking ──
    CREATE TABLE IF NOT EXISTS _change_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id  TEXT NOT NULL,
      action     TEXT NOT NULL, -- insert, update, delete
      data       TEXT,          -- JSON snapshot for insert/update
      synced     INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_changelog_unsynced ON _change_log(synced) WHERE synced = 0;

    -- ── Church (tenant) ──
    CREATE TABLE IF NOT EXISTS church (
      id              TEXT PRIMARY KEY,
      slug            TEXT UNIQUE,
      name            TEXT NOT NULL,
      denomination    TEXT,
      city            TEXT,
      country         TEXT DEFAULT 'Ghana',
      address         TEXT,
      accent_color    TEXT DEFAULT '#6D5EF8',
      logo_url        TEXT,
      sms_credits     INTEGER DEFAULT 50,
      member_prefix   TEXT,
      member_seq      INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    -- ── Branch ──
    CREATE TABLE IF NOT EXISTS branch (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      city       TEXT,
      is_hq      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_branch_church ON branch(church_id);

    -- ── User (auth) ──
    CREATE TABLE IF NOT EXISTS user (
      id            TEXT PRIMARY KEY,
      church_id     TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id     TEXT REFERENCES branch(id),
      email         TEXT UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT,
      role          TEXT DEFAULT 'Volunteer',
      custom_role_id TEXT,
      photo_url     TEXT,
      phone         TEXT,
      person_id     TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_church ON user(church_id);

    -- ── Department ──
    CREATE TABLE IF NOT EXISTS department (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(church_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_dept_church ON department(church_id);

    -- ── Person (member/congregant) ──
    CREATE TABLE IF NOT EXISTS person (
      id              TEXT PRIMARY KEY,
      church_id       TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id       TEXT REFERENCES branch(id),
      member_id       TEXT,
      first_name      TEXT NOT NULL,
      last_name       TEXT NOT NULL,
      other_names     TEXT,
      email           TEXT,
      phone           TEXT,
      status          TEXT DEFAULT 'active',
      location        TEXT,
      photo_url       TEXT,
      birthday        TEXT,
      anniversary     TEXT,
      joined_at       TEXT DEFAULT (datetime('now')),
      notes           TEXT,
      custom_fields   TEXT, -- JSON

      -- Leadership
      leader_title     TEXT,
      featured         INTEGER DEFAULT 0,
      leader_sort_order INTEGER DEFAULT 0,

      -- Profile fields
      gender           TEXT,
      title            TEXT,
      date_of_birth    TEXT,
      occupation       TEXT,
      employer         TEXT,
      previous_church  TEXT,
      date_of_membership TEXT,
      place_of_birth   TEXT,
      nationality      TEXT,
      country          TEXT,
      region           TEXT,
      district         TEXT,
      town             TEXT,
      national_id      TEXT,
      house_address    TEXT,
      home_town        TEXT,
      work_phone       TEXT,
      postal_address   TEXT,
      home_phone       TEXT,
      special_interest TEXT,
      marital_status   TEXT,
      baptized         INTEGER,

      -- Age group & guardian
      age_group       TEXT,
      parent_id       TEXT REFERENCES person(id) ON DELETE SET NULL,
      guardian_name   TEXT,
      guardian_phone  TEXT,
      school          TEXT,
      grade           TEXT,

      -- Emergency contact
      emergency_name     TEXT,
      emergency_phone    TEXT,
      emergency_relation TEXT,
      emergency_email    TEXT,
      emergency_address  TEXT,

      -- Department
      department_id TEXT REFERENCES department(id),

      UNIQUE(church_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_person_church ON person(church_id);
    CREATE INDEX IF NOT EXISTS idx_person_status ON person(church_id, status);
    CREATE INDEX IF NOT EXISTS idx_person_branch ON person(branch_id);
    CREATE INDEX IF NOT EXISTS idx_person_dept ON person(department_id);

    -- ── Person <-> Department many-to-many ──
    CREATE TABLE IF NOT EXISTS person_department (
      person_id     TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL REFERENCES department(id) ON DELETE CASCADE,
      PRIMARY KEY (person_id, department_id)
    );

    -- ── Department positions ──
    CREATE TABLE IF NOT EXISTS department_position (
      id            TEXT PRIMARY KEY,
      church_id     TEXT NOT NULL,
      person_id     TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL REFERENCES department(id) ON DELETE CASCADE,
      position      TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(person_id, department_id, position)
    );

    -- ── Household ──
    CREATE TABLE IF NOT EXISTS household (
      id        TEXT PRIMARY KEY,
      church_id TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name      TEXT NOT NULL
    );

    -- ── Group ──
    CREATE TABLE IF NOT EXISTS "group" (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      type        TEXT DEFAULT 'small_group',
      description TEXT,
      leader_id   TEXT REFERENCES person(id) ON DELETE SET NULL,
      meeting_day TEXT,
      meeting_time TEXT,
      location    TEXT,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_group_church ON "group"(church_id);

    -- ── Group <-> Person many-to-many ──
    CREATE TABLE IF NOT EXISTS group_member (
      group_id  TEXT NOT NULL REFERENCES "group"(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, person_id)
    );

    -- ── Attendance Session ──
    CREATE TABLE IF NOT EXISTS attendance_session (
      id           TEXT PRIMARY KEY,
      church_id    TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id    TEXT REFERENCES branch(id),
      service_name TEXT NOT NULL,
      date         TEXT NOT NULL,
      note         TEXT,
      adults       INTEGER DEFAULT 0,
      teens        INTEGER DEFAULT 0,
      children     INTEGER DEFAULT 0,
      visitors     INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attsess_church ON attendance_session(church_id);

    -- ── Attendance Record ──
    CREATE TABLE IF NOT EXISTS attendance_record (
      id           TEXT PRIMARY KEY,
      church_id    TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id    TEXT REFERENCES branch(id),
      person_id    TEXT REFERENCES person(id),
      session_id   TEXT REFERENCES attendance_session(id) ON DELETE CASCADE,
      guest_name   TEXT,
      category     TEXT DEFAULT 'adult',
      service_name TEXT NOT NULL,
      date         TEXT NOT NULL,
      method       TEXT DEFAULT 'manual'
    );
    CREATE INDEX IF NOT EXISTS idx_attrec_session ON attendance_record(session_id);

    -- ── Fund ──
    CREATE TABLE IF NOT EXISTS fund (
      id        TEXT PRIMARY KEY,
      church_id TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      color     TEXT DEFAULT '#6D5EF8'
    );

    -- ── Gift (giving/tithe) ──
    CREATE TABLE IF NOT EXISTS gift (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id   TEXT REFERENCES branch(id),
      person_id   TEXT REFERENCES person(id),
      donor_name  TEXT,
      fund_id     TEXT REFERENCES fund(id),
      amount      REAL NOT NULL,
      currency    TEXT DEFAULT 'GHS',
      method      TEXT DEFAULT 'Cash',
      recurring   INTEGER DEFAULT 0,
      reference   TEXT,
      receipt_sent INTEGER DEFAULT 0,
      date        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gift_church ON gift(church_id);
    CREATE INDEX IF NOT EXISTS idx_gift_date ON gift(church_id, date);

    -- ── Transaction (accounting) ──
    CREATE TABLE IF NOT EXISTS "transaction" (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      category    TEXT NOT NULL,
      fund        TEXT,
      amount      REAL NOT NULL,
      date        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_txn_church ON "transaction"(church_id);

    -- ── Expense ──
    CREATE TABLE IF NOT EXISTS expense (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      category    TEXT DEFAULT 'general',
      amount      REAL NOT NULL,
      vendor      TEXT,
      receipt_ref TEXT,
      approved_by TEXT,
      date        TEXT DEFAULT (datetime('now')),
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_expense_church ON expense(church_id);

    -- ── Event ──
    CREATE TABLE IF NOT EXISTS event (
      id        TEXT PRIMARY KEY,
      church_id TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branch(id),
      title     TEXT NOT NULL,
      type      TEXT,
      starts_at TEXT NOT NULL,
      capacity  INTEGER,
      paid      INTEGER DEFAULT 0,
      price     REAL
    );
    CREATE INDEX IF NOT EXISTS idx_event_church ON event(church_id);

    -- ── Visitor ──
    CREATE TABLE IF NOT EXISTS visitor (
      id           TEXT PRIMARY KEY,
      church_id    TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      first_name   TEXT NOT NULL,
      last_name    TEXT NOT NULL,
      phone        TEXT,
      email        TEXT,
      purpose      TEXT,
      notes        TEXT,
      custom_fields TEXT,
      visit_date   TEXT DEFAULT (datetime('now')),
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_visitor_church ON visitor(church_id);

    -- ── Harvest ──
    CREATE TABLE IF NOT EXISTS harvest (
      id        TEXT PRIMARY KEY,
      church_id TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      year      INTEGER NOT NULL,
      title     TEXT DEFAULT 'Annual Harvest',
      date      TEXT,
      goal      REAL,
      raised    REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(church_id, year)
    );

    -- ── Harvest Contribution ──
    CREATE TABLE IF NOT EXISTS harvest_contribution (
      id          TEXT PRIMARY KEY,
      harvest_id  TEXT NOT NULL REFERENCES harvest(id) ON DELETE CASCADE,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      person_id   TEXT REFERENCES person(id),
      donor_name  TEXT NOT NULL,
      donor_phone TEXT,
      donor_type  TEXT DEFAULT 'member',
      amount      REAL NOT NULL,
      method      TEXT DEFAULT 'Cash',
      date        TEXT DEFAULT (datetime('now')),
      receipt_sent INTEGER DEFAULT 0
    );

    -- ── Day Born ──
    CREATE TABLE IF NOT EXISTS day_born_week (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      branch_id  TEXT REFERENCES branch(id),
      week_of    TEXT NOT NULL,
      monday     REAL DEFAULT 0,
      tuesday    REAL DEFAULT 0,
      wednesday  REAL DEFAULT 0,
      thursday   REAL DEFAULT 0,
      friday     REAL DEFAULT 0,
      saturday   REAL DEFAULT 0,
      sunday     REAL DEFAULT 0,
      posted     INTEGER DEFAULT 0,
      posted_at  TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(church_id, week_of)
    );

    CREATE TABLE IF NOT EXISTS day_born_entry (
      id          TEXT PRIMARY KEY,
      week_id     TEXT NOT NULL REFERENCES day_born_week(id) ON DELETE CASCADE,
      day         TEXT NOT NULL,
      person_name TEXT,
      method      TEXT NOT NULL,
      amount      REAL NOT NULL,
      reference   TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ── Follow-ups ──
    CREATE TABLE IF NOT EXISTS follow_up (
      id           TEXT PRIMARY KEY,
      church_id    TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      person_id    TEXT REFERENCES person(id),
      visitor_id   TEXT REFERENCES visitor(id),
      assignee_id  TEXT REFERENCES user(id),
      type         TEXT NOT NULL,
      title        TEXT NOT NULL,
      note         TEXT,
      status       TEXT DEFAULT 'open',
      due_date     TEXT,
      completed_at TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- ── Prayer requests ──
    CREATE TABLE IF NOT EXISTS prayer_request (
      id           TEXT PRIMARY KEY,
      church_id    TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      person_id    TEXT REFERENCES person(id),
      name         TEXT NOT NULL,
      request      TEXT NOT NULL,
      is_anonymous INTEGER DEFAULT 0,
      status       TEXT DEFAULT 'active',
      prayer_count INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- ── Church notices ──
    CREATE TABLE IF NOT EXISTS church_notice (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      pinned     INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Sermon ──
    CREATE TABLE IF NOT EXISTS sermon (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      preacher   TEXT,
      series     TEXT,
      date       TEXT DEFAULT (datetime('now')),
      scripture  TEXT,
      notes      TEXT,
      audio_url  TEXT,
      video_url  TEXT,
      published  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Asset ──
    CREATE TABLE IF NOT EXISTS asset (
      id            TEXT PRIMARY KEY,
      church_id     TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      category      TEXT DEFAULT 'general',
      location      TEXT,
      condition     TEXT DEFAULT 'good',
      serial_no     TEXT,
      purchase_date TEXT,
      purchase_price REAL,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- ── Budget ──
    CREATE TABLE IF NOT EXISTS budget (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      year       INTEGER NOT NULL,
      quarter    INTEGER,
      status     TEXT DEFAULT 'draft',
      total      REAL DEFAULT 0,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_item (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL,
      budget_id   TEXT NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
      category    TEXT NOT NULL,
      description TEXT NOT NULL,
      amount      REAL NOT NULL,
      spent       REAL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ── Volunteer rosters ──
    CREATE TABLE IF NOT EXISTS volunteer_roster (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      ministry   TEXT,
      start_date TEXT NOT NULL,
      end_date   TEXT NOT NULL,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS volunteer_slot (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL,
      roster_id  TEXT NOT NULL REFERENCES volunteer_roster(id) ON DELETE CASCADE,
      person_id  TEXT REFERENCES person(id) ON DELETE SET NULL,
      role       TEXT NOT NULL,
      date       TEXT NOT NULL,
      shift      TEXT DEFAULT 'morning',
      status     TEXT DEFAULT 'assigned',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Facility & Booking ──
    CREATE TABLE IF NOT EXISTS facility (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      capacity   INTEGER,
      location   TEXT,
      is_active  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS booking (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      facility_id TEXT NOT NULL REFERENCES facility(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      booked_by   TEXT NOT NULL,
      start_time  TEXT NOT NULL,
      end_time    TEXT NOT NULL,
      notes       TEXT,
      status      TEXT DEFAULT 'confirmed',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ── Custom Role ──
    CREATE TABLE IF NOT EXISTS custom_role (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      sections   TEXT, -- JSON array
      can_delete INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(church_id, name)
    );

    -- ── Welfare ──
    CREATE TABLE IF NOT EXISTS welfare_record (
      id             TEXT PRIMARY KEY,
      church_id      TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      person_id      TEXT REFERENCES person(id),
      recipient_name TEXT NOT NULL,
      type           TEXT DEFAULT 'financial',
      amount         REAL,
      description    TEXT,
      date           TEXT DEFAULT (datetime('now')),
      created_at     TEXT DEFAULT (datetime('now'))
    );

    -- ── Devotional ──
    CREATE TABLE IF NOT EXISTS devotional (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      scripture  TEXT,
      body       TEXT NOT NULL,
      author     TEXT,
      date       TEXT DEFAULT (datetime('now')),
      published  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Testimony ──
    CREATE TABLE IF NOT EXISTS testimony (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      person_id  TEXT REFERENCES person(id),
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      category   TEXT DEFAULT 'praise',
      status     TEXT DEFAULT 'pending',
      anonymous  INTEGER DEFAULT 0,
      date       TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Counseling ──
    CREATE TABLE IF NOT EXISTS counseling_session (
      id             TEXT PRIMARY KEY,
      church_id      TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      person_id      TEXT REFERENCES person(id),
      counselor_id   TEXT REFERENCES user(id),
      type           TEXT DEFAULT 'general',
      summary        TEXT NOT NULL,
      notes          TEXT,
      status         TEXT DEFAULT 'open',
      confidential   INTEGER DEFAULT 1,
      date           TEXT DEFAULT (datetime('now')),
      follow_up_date TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    -- ── Pledge ──
    CREATE TABLE IF NOT EXISTS pledge (
      id          TEXT PRIMARY KEY,
      church_id   TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      fund_id     TEXT REFERENCES fund(id),
      campaign_id TEXT,
      donor_name  TEXT NOT NULL,
      amount      REAL NOT NULL,
      fulfilled   REAL DEFAULT 0,
      due_at      TEXT
    );

    -- ── Campaign ──
    CREATE TABLE IF NOT EXISTS campaign (
      id        TEXT PRIMARY KEY,
      church_id TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      goal      REAL NOT NULL,
      raised    REAL DEFAULT 0,
      ends_at   TEXT
    );

    -- ── Communication ──
    CREATE TABLE IF NOT EXISTS communication (
      id           TEXT PRIMARY KEY,
      church_id    TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      channel      TEXT NOT NULL,
      body         TEXT NOT NULL,
      segment      TEXT,
      sent         INTEGER DEFAULT 0,
      delivered    INTEGER DEFAULT 0,
      opened       INTEGER DEFAULT 0,
      status       TEXT DEFAULT 'draft',
      scheduled_at TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- ── Automation / Reminder ──
    CREATE TABLE IF NOT EXISTS automation (
      id                TEXT PRIMARY KEY,
      church_id         TEXT NOT NULL REFERENCES church(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      description       TEXT,
      trigger_type      TEXT NOT NULL,
      channel           TEXT DEFAULT 'SMS',
      active            INTEGER DEFAULT 1,
      runs              INTEGER DEFAULT 0,
      message_template  TEXT,
      last_run_at       TEXT,
      custom_date       TEXT,
      custom_recurrence TEXT,
      audience          TEXT
    );

    -- ── Audit log (local) ──
    CREATE TABLE IF NOT EXISTS audit_log (
      id         TEXT PRIMARY KEY,
      church_id  TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      action     TEXT NOT NULL,
      entity     TEXT NOT NULL,
      entity_id  TEXT,
      detail     TEXT,
      meta       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}
