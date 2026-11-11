# Simulated Project Context: Python/FastAPI Project with No Review Dimensions

## Project Structure

Python FastAPI backend with SQLAlchemy ORM.

```
src/
  routes/         ← FastAPI route handlers
  models/         ← SQLAlchemy models
  migrations/     ← Alembic database migrations
  services/       ← Business logic
  tests/          ← pytest test files
requirements.txt
alembic.ini
```

## Key Dependencies (requirements.txt)

```
fastapi==0.104.1
sqlalchemy==2.0.23
alembic==1.12.1
pydantic==2.5.0
pytest==7.4.3
httpx==0.25.2
```

## Review Dimensions State

`.claude/review-dimensions/` directory does **not exist**.

No review dimensions have been installed for this project. Running `/setup-sdlc --dimensions`
would scan the project and propose dimensions based on the detected stack (FastAPI, SQLAlchemy,
Alembic migrations, pytest).

## review-prepare.js Output (JSON manifest)

```json
{
  "scope": "all",
  "baseBranch": "main",
  "changedFiles": [
    "src/routes/users.py",
    "src/models/user.py",
    "src/migrations/versions/abc123_add_user_table.py",
    "src/tests/test_users.py"
  ],
  "dimensions": [],
  "errors": [
    "No review dimensions found. Run /setup-sdlc --dimensions to create tailored dimensions for this project."
  ]
}
```

### prepare.scan

```json
{
  "signals": {
    "languages": ["python"],
    "frameworks": ["fastapi"],
    "hasDatabase": true,
    "dbType": "sqlalchemy",
    "hasApi": true,
    "apiFormat": "rest",
    "hasTests": true,
    "testFramework": "pytest",
    "hasCi": false,
    "ciPlatform": null,
    "hasMonorepo": false,
    "hasOpenSpec": false,
    "directories": ["src/"],
    "reviewDimensions": [],
    "claudeMdRules": [],
    "structure": {
      "**/routes/**": { "label": "API routes", "count": 1, "samples": ["src/routes/users.py"], "truncated": false },
      "**/models/**": { "label": "Data models", "count": 1, "samples": ["src/models/user.py"], "truncated": false },
      "**/migrations/**": { "label": "Database migrations", "count": 1, "samples": ["src/migrations/versions/abc123_add_user_table.py"], "truncated": false },
      "**/tests/**": { "label": "Test files", "count": 1, "samples": ["src/tests/test_users.py"], "truncated": false }
    }
  },
  "files": {
    "requirements.txt": {
      "content": "fastapi==0.104.1\nsqlalchemy==2.0.23\nalembic==1.12.1\npydantic==2.5.0\npytest==7.4.3\nhttpx==0.25.2\n",
      "truncated": false
    }
  },
  "hosting": { "github": true, "via": "remote" },
  "ciFiles": [],
  "git": { "branch": "main", "recentCommits": [] },
  "jiraEvidence": { "keys": {}, "ambiguous": true },
  "recentPrs": []
}
```
