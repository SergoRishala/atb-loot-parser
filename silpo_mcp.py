"""
Модуль інтеграції з офіційним MCP сервером «Сільпо» (https://mcp.silpo.ua/mcp).
Відповідає офіційній документації хакатону Сільпо AI Factory:
- Dynamic Client Registration (RFC 7591)
- Авторизація OAuth 2.1 (PKCE S256)
- Виклики JSON-RPC 2.0 інструментів (tools/list, tools/call)
- Збереження токенів та автооновлення
"""

import os
import json
import base64
import hashlib
import secrets
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional

MCP_ENDPOINT = "https://mcp.silpo.ua/mcp"
REGISTER_ENDPOINT = "https://mcp.silpo.ua/register"
AUTHORIZE_ENDPOINT = "https://mcp.silpo.ua/authorize"
TOKEN_ENDPOINT = "https://mcp.silpo.ua/token"
WELL_KNOWN_ENDPOINT = "https://mcp.silpo.ua/.well-known/oauth-authorization-server"

TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".silpo_mcp_tokens.json")
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".silpo_mcp_client.json")


def generate_pkce_pair() -> tuple[str, str]:
    """
    Генерує пару code_verifier та code_challenge (S256) згідно з RFC 7636.
    """
    code_verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return code_verifier, code_challenge


class SilpoMCPClient:
    def __init__(self, redirect_uri: str = "http://localhost:5050/oauth/callback"):
        self.redirect_uri = redirect_uri
        self.client_id = None
        self.access_token = None
        self.refresh_token = None
        self._load_config()
        self._load_tokens()

    def _load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.client_id = data.get("client_id")
            except Exception:
                pass

    def _save_config(self, client_id: str):
        self.client_id = client_id
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"client_id": client_id, "redirect_uri": self.redirect_uri}, f, indent=2)

    def _load_tokens(self):
        if os.path.exists(TOKEN_FILE):
            try:
                with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.access_token = data.get("access_token")
                    self.refresh_token = data.get("refresh_token")
            except Exception:
                pass

    def _save_tokens(self, tokens: Dict[str, Any]):
        self.access_token = tokens.get("access_token")
        self.refresh_token = tokens.get("refresh_token")
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(tokens, f, indent=2)

    def register_client(self) -> str:
        """
        Реєструє клієнт через Dynamic Client Registration (POST /register).
        """
        if self.client_id:
            return self.client_id

        payload = {
            "client_name": "Silpo Product Parser & Explorer",
            "redirect_uris": [self.redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none"
        }
        req = urllib.request.Request(
            REGISTER_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cid = data["client_id"]
                self._save_config(cid)
                return cid
        except Exception as e:
            raise RuntimeError(f"Failed to register MCP client: {e}") from e

    def get_authorization_url(self) -> tuple[str, str, str]:
        """
        Створює URL для переходу на сторінку авторизації Сільпо (auth.silpo.ua).
        Повертає: (auth_url, code_verifier, state)
        """
        client_id = self.register_client()
        code_verifier, code_challenge = generate_pkce_pair()
        state = secrets.token_hex(16)

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": self.redirect_uri,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "scope": "offline_access"
        }
        auth_url = f"{AUTHORIZE_ENDPOINT}?{urllib.parse.urlencode(params)}"
        return auth_url, code_verifier, state

    def exchange_code_for_token(self, code: str, code_verifier: str) -> Dict[str, Any]:
        """
        Обмінює отриманий authorization_code та code_verifier на токени доступу (POST /token).
        """
        payload = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "code": code,
            "redirect_uri": self.redirect_uri,
            "code_verifier": code_verifier
        }
        data_encoded = urllib.parse.urlencode(payload).encode("utf-8")
        req = urllib.request.Request(
            TOKEN_ENDPOINT,
            data=data_encoded,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                tokens = json.loads(resp.read().decode("utf-8"))
                self._save_tokens(tokens)
                return tokens
        except Exception as e:
            raise RuntimeError(f"Token exchange failed: {e}") from e

    def refresh_access_token(self) -> Optional[Dict[str, Any]]:
        """
        Оновлює access_token за допомогою refresh_token.
        """
        if not self.refresh_token:
            return None

        payload = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "refresh_token": self.refresh_token
        }
        data_encoded = urllib.parse.urlencode(payload).encode("utf-8")
        req = urllib.request.Request(
            TOKEN_ENDPOINT,
            data=data_encoded,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                tokens = json.loads(resp.read().decode("utf-8"))
                self._save_tokens(tokens)
                return tokens
        except Exception:
            return None

    def call_mcp_rpc(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Виконує JSON-RPC 2.0 запит до https://mcp.silpo.ua/mcp.
        """
        if not self.access_token:
            raise RuntimeError("MCP Client не авторизовано. Потрібно пройти OAuth авторизацію.")

        rpc_body = {
            "jsonrpc": "2.0",
            "method": method,
            "id": int(secrets.token_hex(4), 16)
        }
        if params is not None:
            rpc_body["params"] = params

        req = urllib.request.Request(
            MCP_ENDPOINT,
            data=json.dumps(rpc_body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Bearer {self.access_token}"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401 and self.refresh_token:
                # Спробувати оновити токен та повторити
                if self.refresh_access_token():
                    return self.call_mcp_rpc(method, params)
            body = e.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"MCP RPC HTTP {e.code}: {body}") from e

    def is_authorized(self) -> bool:
        return bool(self.access_token)

    def get_status(self) -> Dict[str, Any]:
        return {
            "endpoint": MCP_ENDPOINT,
            "registered": bool(self.client_id),
            "client_id": self.client_id,
            "authorized": bool(self.access_token),
            "has_refresh_token": bool(self.refresh_token)
        }
