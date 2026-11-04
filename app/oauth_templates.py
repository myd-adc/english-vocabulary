"""HTML for the OAuth authorize step (a single password form)."""

from html import escape

_LOGIN_PAGE = """<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LexiVocab — Вхід</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           display: flex; justify-content: center; align-items: center; min-height: 100vh;
           margin: 0; background: #f5f5f7; }
    .card { background: #fff; padding: 2rem; border-radius: 14px; width: 100%; max-width: 360px;
            box-shadow: 0 2px 12px rgba(0,0,0,.1); margin: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 .25rem; text-align: center; }
    p.sub { color: #555; font-size: .875rem; text-align: center; margin: 0 0 1.5rem; }
    label { display: block; margin-bottom: .5rem; font-size: .875rem; color: #333; }
    input[type=password] { width: 100%; padding: .65rem; border: 1px solid #ccc; border-radius: 8px;
            font-size: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: .75rem; margin-top: 1rem; background: #0071e3; color: #fff;
             border: none; border-radius: 999px; font-size: 1rem; cursor: pointer; }
    .error { color: #b3261e; font-size: .875rem; margin-bottom: 1rem; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>LexiVocab</h1>
    <p class="sub">Дозволити Claude доступ до вашого словника</p>
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
