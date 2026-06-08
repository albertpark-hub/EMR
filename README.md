# thynC EMR — 설치 및 실행 가이드

## 📁 프로젝트 구조
```
thyc-emr/
├── backend/
│   ├── server.js        # Express API 서버
│   ├── schema.sql       # DB 스키마 + 초기 데이터
│   ├── package.json
│   └── .env.example     # 환경변수 템플릿
└── frontend/
    └── index.html       # 프론트엔드 (단일 파일)
```

---

## 1. DB 준비 (MySQL 기준)

```sql
-- MySQL 접속 후
CREATE DATABASE thyc_emr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE thyc_emr;
-- schema.sql 실행
SOURCE /path/to/backend/schema.sql;
```

PostgreSQL 사용 시:
```bash
createdb thyc_emr
psql thyc_emr < backend/schema.sql
# schema.sql 상단 PostgreSQL 주석 참고 (UUID, ENUM 문법 차이)
```

---

## 2. 백엔드 설정

```bash
cd backend
npm install

# .env 파일 생성
cp .env.example .env
# .env 파일을 열어 DB 정보와 JWT_SECRET 수정
```

`.env` 주요 설정:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=thyc_emr
JWT_SECRET=최소32자이상의랜덤문자열로변경하세요!!
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000   # 프론트엔드 주소
```

---

## 3. 백엔드 실행

```bash
# 개발 (nodemon 자동 재시작)
npm run dev

# 운영
npm start
```

서버 확인: http://localhost:4000/api/health

---

## 4. 프론트엔드 실행

`frontend/index.html` 을 웹서버로 서빙하거나 직접 열기:

```bash
# 간단한 로컬 서버 (Node.js)
npx serve frontend -p 3000

# 또는 nginx/apache로 index.html 서빙
```

**백엔드 주소가 다를 경우** `index.html` 상단 스크립트에서 수정:
```javascript
window.API_BASE = 'http://your-server.com:4000';
```

---

## 5. 기본 계정

| 이메일 | 비밀번호 | 역할 |
|--------|---------|------|
| admin@company.com | 1234 | 관리자 |

> ⚠️ 운영 배포 전 반드시 비밀번호 변경 및 `.env` 의 `JWT_SECRET` 교체

---

## 6. API 엔드포인트 요약

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/auth/login | 로그인 |
| GET | /api/auth/me | 내 정보 |
| PATCH | /api/auth/password | 비밀번호 변경 |
| GET/POST | /api/users | 사용자 목록/추가 |
| PATCH/DELETE | /api/users/:id | 사용자 수정/삭제 |
| GET/POST | /api/stages | 단계 목록/추가 |
| PATCH/DELETE | /api/stages/:id | 단계 수정/삭제 |
| GET/POST | /api/groups | 그룹 목록/추가 |
| PATCH/DELETE | /api/groups/:id | 그룹 수정/삭제 |
| GET/POST | /api/deals | 거래처 목록/추가 |
| GET/PATCH/DELETE | /api/deals/:id | 거래처 상세/수정/삭제 |
| POST | /api/deals/:id/history | 이력 추가 |

---

## PostgreSQL 마이그레이션 주의사항

`schema.sql` 에서 MySQL 전용 문법을 아래와 같이 변경:

```sql
-- UUID 기본값
DEFAULT (UUID())  →  DEFAULT gen_random_uuid()

-- ENUM
ENUM('a','b')  →  VARCHAR(20) 또는 별도 CHECK 제약

-- ON UPDATE CURRENT_TIMESTAMP
→ 트리거로 대체 필요

-- DATETIME
→  TIMESTAMP
```
