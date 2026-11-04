"""HTML for the OAuth authorize step (a single password form)."""

from html import escape

_LOGIN_PAGE = """<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LexiVocab: вхід</title>
  <style>
    :root { color-scheme: light dark; --bg:#f2f3ef; --text:#1a1d1b; --text-2:#5a625d; --rule:#d3d7d0;
            --surface:#fafaf8; --accent:#1f5a47; --on-accent:#f6f8f5; --danger:#a3261e; }
    @media (prefers-color-scheme: dark) {
      :root { --bg:#101412; --text:#e9eae4; --text-2:#99a39c; --rule:#2b332e; --surface:#171c19;
              --accent:#8ccaae; --on-accent:#0f1f18; --danger:#f08a80; }
    }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
           display: flex; justify-content: center; align-items: center; min-height: 100vh;
           margin: 0; padding: 1.5rem; background: var(--bg); color: var(--text); }
    .card { width: 100%; max-width: 340px; }
    h1 { font-family: ui-serif, "New York", Georgia, serif; font-size: 2rem; font-weight: 600; margin: 0 0 .25rem; }
    p.sub { color: var(--text-2); font-size: .9375rem; margin: 0 0 1.5rem; }
    label { display: block; margin-bottom: .375rem; font-size: .8125rem; color: var(--text-2); }
    input[type=password] { width: 100%; min-height: 48px; padding: 0 .875rem; border: 1px solid var(--rule);
            border-radius: 8px; font-size: 1rem; background: var(--surface); color: var(--text); }
    input[type=password]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    button { width: 100%; min-height: 48px; margin-top: .75rem; background: var(--accent); color: var(--on-accent);
             border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .error { color: var(--danger); font-size: .9375rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>LexiVocab</h1>
    <p class="sub">Дозволити Claude доступ до словника</p>
    __ERROR__
    <form method="POST" action="/authorize/submit">
      <input type="hidden" name="auth_params" value="__NONCE__">
      <label for="password">Пароль (MCP_SECRET)</label>
      <input type="password" id="password" name="password" required autofocus>
      <button type="submit">Увійти</button>
    </form>
  </div>
</body>
</html>"""


def login_template(auth_params_nonce: str, error: str | None = None) -> str:
    error_html = f'<div class="error">{escape(error)}</div>' if error else ""
    return _LOGIN_PAGE.replace("__ERROR__", error_html).replace(
        "__NONCE__", escape(auth_params_nonce, quote=True)
    )
