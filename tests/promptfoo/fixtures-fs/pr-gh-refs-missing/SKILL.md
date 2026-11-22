# pr-sdlc fixture without explicit gh refs

```bash
gh pr create --title '<title>' --body-file '<BODY_FILE>' 2> '<ERR_FILE>'
```

Re-run `gh pr create` with the same arguments **exactly once**.

```bash
gh pr edit --title '<title>' --body-file '<BODY_FILE>'
```
