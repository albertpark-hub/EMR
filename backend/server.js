// server.js — thynC EMR 백엔드 API
require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const { v4: uuid } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*', credentials: true }));
app.use(express.json());

// ── DB 풀 ─────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'thyc_emr',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+09:00',
});

// ── JWT 인증 미들웨어 ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: '인증이 필요합니다' });
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '토큰이 유효하지 않습니다' });
  }
}

// 역할 확인 미들웨어 팩토리
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: '권한이 없습니다' });
    next();
  };
}

// ── 권한 정의 ─────────────────────────────────────────────────────────────────
const PERMS = {
  admin:    { addDeal:true,  editDeal:true,  deleteDeal:true,  changeStage:true,  changeDeadline:true,  viewAll:true,  manageUsers:true,  manageStages:true  },
  manager:  { addDeal:true,  editDeal:true,  deleteDeal:true,  changeStage:true,  changeDeadline:true,  viewAll:true,  manageUsers:false, manageStages:false },
  hospital: { addDeal:true,  editDeal:false, deleteDeal:false, changeStage:false, changeDeadline:false, viewAll:false, manageUsers:false, manageStages:false },
  member:   { addDeal:true,  editDeal:true,  deleteDeal:false, changeStage:true,  changeDeadline:true,  viewAll:false, manageUsers:false, manageStages:false },
};
function can(role, perm) { return !!(PERMS[role]?.[perm]); }

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요' });
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND active = 1', [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, color: user.color,
        assigneeLabel: user.assignee_label,
        perms: PERMS[user.role] || {},
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const u = rows[0];
  if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
  res.json({
    id: u.id, name: u.name, email: u.email,
    role: u.role, color: u.color, assigneeLabel: u.assignee_label,
    perms: PERMS[u.role] || {},
  });
});

// PATCH /api/auth/password
app.patch('/api/auth/password', auth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 2)
    return res.status(400).json({ error: '비밀번호는 2자 이상이어야 합니다' });
  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// USERS (관리자 전용)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/users
app.get('/api/users', auth, requireRole('admin', 'manager'), async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, assignee_label, email, role, color, active, last_login, created_at FROM users ORDER BY created_at'
  );
  res.json(rows);
});

// POST /api/users
app.post('/api/users', auth, requireRole('admin'), async (req, res) => {
  const { name, assigneeLabel, email, password, role, color } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다' });
  const [exist] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exist.length) return res.status(409).json({ error: '이미 사용 중인 이메일입니다' });
  const hash = await bcrypt.hash(password, 10);
  const id = uuid();
  await pool.query(
    'INSERT INTO users (id, name, assignee_label, email, password_hash, role, color) VALUES (?,?,?,?,?,?,?)',
    [id, name, assigneeLabel || name, email, hash, role || 'member', color || '#1A56DB']
  );
  res.status(201).json({ id });
});

// PATCH /api/users/:id
app.patch('/api/users/:id', auth, requireRole('admin'), async (req, res) => {
  const { name, assigneeLabel, email, password, role, color, active } = req.body;
  const fields = [];
  const vals   = [];
  if (name          != null) { fields.push('name = ?');           vals.push(name); }
  if (assigneeLabel != null) { fields.push('assignee_label = ?'); vals.push(assigneeLabel); }
  if (email         != null) { fields.push('email = ?');          vals.push(email); }
  if (role          != null) { fields.push('role = ?');           vals.push(role); }
  if (color         != null) { fields.push('color = ?');          vals.push(color); }
  if (active        != null) { fields.push('active = ?');         vals.push(active ? 1 : 0); }
  if (password) {
    fields.push('password_hash = ?');
    vals.push(await bcrypt.hash(password, 10));
  }
  if (!fields.length) return res.status(400).json({ error: '변경할 항목이 없습니다' });
  vals.push(req.params.id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

// DELETE /api/users/:id
app.delete('/api/users/:id', auth, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다' });
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// STAGES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/stages', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM stages ORDER BY sort_order');
  res.json(rows);
});

app.post('/api/stages', auth, requireRole('admin', 'manager'), async (req, res) => {
  const { label, color, bgColor, textColor } = req.body;
  if (!label) return res.status(400).json({ error: '단계명은 필수입니다' });
  const [[{ maxOrd }]] = await pool.query('SELECT MAX(sort_order) as maxOrd FROM stages');
  const id = uuid();
  await pool.query(
    'INSERT INTO stages (id, label, color, bg_color, text_color, sort_order) VALUES (?,?,?,?,?,?)',
    [id, label, color||'#94A3B8', bgColor||'#F1F5F9', textColor||'#475569', (maxOrd||0)+1]
  );
  res.status(201).json({ id });
});

app.patch('/api/stages/:id', auth, requireRole('admin', 'manager'), async (req, res) => {
  const { label, color, bgColor, textColor, sortOrder } = req.body;
  const fields = []; const vals = [];
  if (label     != null) { fields.push('label = ?');      vals.push(label); }
  if (color     != null) { fields.push('color = ?');      vals.push(color); }
  if (bgColor   != null) { fields.push('bg_color = ?');   vals.push(bgColor); }
  if (textColor != null) { fields.push('text_color = ?'); vals.push(textColor); }
  if (sortOrder != null) { fields.push('sort_order = ?'); vals.push(sortOrder); }
  if (!fields.length) return res.status(400).json({ error: '변경할 항목이 없습니다' });
  vals.push(req.params.id);
  await pool.query(`UPDATE stages SET ${fields.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

app.delete('/api/stages/:id', auth, requireRole('admin'), async (req, res) => {
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) as cnt FROM deals WHERE stage_id = ?', [req.params.id]
  );
  if (cnt > 0) return res.status(409).json({ error: '해당 단계에 거래처가 있어 삭제할 수 없습니다' });
  await pool.query('DELETE FROM stages WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// GROUPS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/groups', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM groups_ ORDER BY sort_order');
  res.json(rows);
});

app.post('/api/groups', auth, requireRole('admin', 'manager'), async (req, res) => {
  const { label, color, icon } = req.body;
  if (!label) return res.status(400).json({ error: '그룹명은 필수입니다' });
  const [[{ maxOrd }]] = await pool.query('SELECT MAX(sort_order) as maxOrd FROM groups_');
  const id = uuid();
  await pool.query(
    'INSERT INTO groups_ (id, label, color, icon, sort_order) VALUES (?,?,?,?,?)',
    [id, label, color||'#1A56DB', icon||'ti-tag', (maxOrd||0)+1]
  );
  res.status(201).json({ id });
});

app.patch('/api/groups/:id', auth, requireRole('admin', 'manager'), async (req, res) => {
  const { label, color, icon } = req.body;
  const fields = []; const vals = [];
  if (label != null) { fields.push('label = ?'); vals.push(label); }
  if (color != null) { fields.push('color = ?'); vals.push(color); }
  if (icon  != null) { fields.push('icon = ?');  vals.push(icon); }
  if (!fields.length) return res.status(400).json({ error: '변경할 항목이 없습니다' });
  vals.push(req.params.id);
  await pool.query(`UPDATE groups_ SET ${fields.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

app.delete('/api/groups/:id', auth, requireRole('admin', 'manager'), async (req, res) => {
  await pool.query('UPDATE deals SET group_id = NULL WHERE group_id = ?', [req.params.id]);
  await pool.query('DELETE FROM groups_ WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// DEALS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/deals  (권한에 따라 본인 것만 or 전체)
app.get('/api/deals', auth, async (req, res) => {
  const viewAll = can(req.user.role, 'viewAll');
  let sql = `
    SELECT d.*, u.name as assignee_name, u.assignee_label,
           g.label as group_label, g.color as group_color, g.icon as group_icon,
           s.label as stage_label, s.color as stage_color,
           s.bg_color, s.text_color, s.sort_order as stage_order
    FROM deals d
    LEFT JOIN users u  ON d.assignee_id = u.id
    LEFT JOIN groups_ g ON d.group_id   = g.id
    LEFT JOIN stages s  ON d.stage_id   = s.id
  `;
  const params = [];
  if (!viewAll) { sql += ' WHERE d.assignee_id = ?'; params.push(req.user.id); }
  sql += ' ORDER BY d.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/deals/:id
app.get('/api/deals/:id', auth, async (req, res) => {
  const viewAll = can(req.user.role, 'viewAll');
  const [rows] = await pool.query(`
    SELECT d.*, u.name as assignee_name, u.assignee_label,
           g.label as group_label, g.color as group_color, g.icon as group_icon,
           s.label as stage_label, s.color as stage_color, s.bg_color, s.text_color
    FROM deals d
    LEFT JOIN users u   ON d.assignee_id = u.id
    LEFT JOIN groups_ g ON d.group_id    = g.id
    LEFT JOIN stages s  ON d.stage_id    = s.id
    WHERE d.id = ?`, [req.params.id]
  );
  const deal = rows[0];
  if (!deal) return res.status(404).json({ error: '거래처를 찾을 수 없습니다' });
  if (!viewAll && deal.assignee_id !== req.user.id)
    return res.status(403).json({ error: '권한이 없습니다' });

  const [history] = await pool.query(
    `SELECT h.*, u.name as user_name FROM deal_history h
     LEFT JOIN users u ON h.user_id = u.id
     WHERE h.deal_id = ? ORDER BY h.created_at ASC`, [req.params.id]
  );
  res.json({ ...deal, history });
});

// POST /api/deals
app.post('/api/deals', auth, async (req, res) => {
  if (!can(req.user.role, 'addDeal'))
    return res.status(403).json({ error: '거래처 추가 권한이 없습니다' });
  const { name, emrVendor, contact, phone, email, assigneeId, groupId, stageId, deadline, note } = req.body;
  if (!name) return res.status(400).json({ error: '거래처명은 필수입니다' });
  const id = uuid();
  await pool.query(
    `INSERT INTO deals (id, name, emr_vendor, contact, phone, email, assignee_id, group_id, stage_id, deadline, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, emrVendor||null, contact||null, phone||null, email||null,
     assigneeId||null, groupId||null, stageId||null, deadline||null, note||null]
  );
  await pool.query(
    'INSERT INTO deal_history (id, deal_id, user_id, type, text) VALUES (?,?,?,?,?)',
    [uuid(), id, req.user.id, 'reg', '거래처 등록']
  );
  res.status(201).json({ id });
});

// PATCH /api/deals/:id
app.patch('/api/deals/:id', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  const deal = rows[0];
  if (!deal) return res.status(404).json({ error: '거래처를 찾을 수 없습니다' });

  const { name, emrVendor, contact, phone, email, assigneeId,
          groupId, stageId, deadline, note } = req.body;

  // 단계 변경 권한 확인
  if (stageId && stageId !== deal.stage_id && !can(req.user.role, 'changeStage'))
    return res.status(403).json({ error: '단계 변경 권한이 없습니다' });
  if (deadline !== undefined && deadline !== deal.deadline && !can(req.user.role, 'changeDeadline'))
    return res.status(403).json({ error: '마감일 변경 권한이 없습니다' });
  if ((name || contact || phone || email || assigneeId || groupId || emrVendor) && !can(req.user.role, 'editDeal'))
    return res.status(403).json({ error: '거래처 편집 권한이 없습니다' });

  const fields = []; const vals = [];
  if (name       != null) { fields.push('name = ?');        vals.push(name); }
  if (emrVendor  != null) { fields.push('emr_vendor = ?');  vals.push(emrVendor); }
  if (contact    != null) { fields.push('contact = ?');     vals.push(contact); }
  if (phone      != null) { fields.push('phone = ?');       vals.push(phone); }
  if (email      != null) { fields.push('email = ?');       vals.push(email); }
  if (assigneeId != null) { fields.push('assignee_id = ?'); vals.push(assigneeId); }
  if (groupId    != null) { fields.push('group_id = ?');    vals.push(groupId || null); }
  if (stageId    != null) { fields.push('stage_id = ?');    vals.push(stageId); }
  if (deadline   != null) { fields.push('deadline = ?');    vals.push(deadline || null); }
  if (note       != null) { fields.push('note = ?');        vals.push(note); }

  if (fields.length) {
    vals.push(req.params.id);
    await pool.query(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`, vals);
  }

  // 단계 변경 이력
  if (stageId && stageId !== deal.stage_id) {
    const [[oldStage]] = await pool.query('SELECT label FROM stages WHERE id = ?', [deal.stage_id]);
    const [[newStage]] = await pool.query('SELECT label FROM stages WHERE id = ?', [stageId]);
    await pool.query(
      'INSERT INTO deal_history (id, deal_id, user_id, type, text) VALUES (?,?,?,?,?)',
      [uuid(), req.params.id, req.user.id, 'stage',
       `단계 변경: ${oldStage?.label||'—'} → ${newStage?.label||'—'}`]
    );
  }

  // 마감일 변경 이력
  if (deadline !== undefined && deadline !== deal.deadline) {
    await pool.query(
      'INSERT INTO deal_history (id, deal_id, user_id, type, text) VALUES (?,?,?,?,?)',
      [uuid(), req.params.id, req.user.id, 'deadline',
       `마감일 변경: ${deal.deadline||'미설정'} → ${deadline||'미설정'}`]
    );
  }

  res.json({ ok: true });
});

// DELETE /api/deals/:id
app.delete('/api/deals/:id', auth, async (req, res) => {
  if (!can(req.user.role, 'deleteDeal'))
    return res.status(403).json({ error: '삭제 권한이 없습니다' });
  await pool.query('DELETE FROM deals WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/deals/:id/history
app.post('/api/deals/:id/history', auth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '내용을 입력하세요' });
  await pool.query(
    'INSERT INTO deal_history (id, deal_id, user_id, type, text) VALUES (?,?,?,?,?)',
    [uuid(), req.params.id, req.user.id, 'note', text]
  );
  res.status(201).json({ ok: true });
});

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

app.listen(PORT, () => console.log(`✅ thynC EMR API 서버 실행 중 → http://localhost:${PORT}`));
