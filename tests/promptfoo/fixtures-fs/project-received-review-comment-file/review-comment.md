## Code Review — 1 dimension(s), 3 finding(s)

### code-quality — 3 finding(s)

<details>
<summary>code-quality</summary>

#### [HIGH] Null check missing

**File:** `src/a.js:12`

x may be null.

**Suggestion:** guard it.

#### [INFO] Naming

Consider a clearer variable name.

#### [CRITICAL] Injection

**File:** `src/b.js:3` · OWASP A03

User input reaches the query unescaped.

</details>

---
