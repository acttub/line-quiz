#!/usr/bin/env python3
"""로컬 확인용 서버. vercel.json의 rewrites·cleanUrls를 흉내낸다.

`python3 -m http.server`로는 /r16·/with/3 같은 경로가 404다(그건 파일이 아니다).
그래서 배포와 다르게 동작하고, 로컬에서 통과한 것이 프로덕션에서 깨지거나 그 반대가 된다.

⚠️ vercel.json의 rewrites를 고치면 아래 ROUTES도 같이 고친다. 둘이 갈라지면
   이 서버는 "된다"고 말하는데 실서비스는 404를 낸다. 실제로 그렇게 한 번 당했다 —
   rewrite 목적지를 `/index.html`로 뒀더니 cleanUrls가 그 주소를 `/`로 308 돌려보내
   목적지가 사라지고 배포본만 404가 났다. Vercel 쪽 목적지는 `/`다.

실행:
    python3 serve.py          # http://localhost:8643
"""
import http.server
import re
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8643

# vercel.json의 rewrites와 같은 목록
ROUTES = [
    re.compile(r"^/r16/?$"),
    re.compile(r"^/r8/?$"),
    re.compile(r"^/r4/?$"),
    re.compile(r"^/final/?$"),
    re.compile(r"^/result/[^/]+/?$"),
    re.compile(r"^/with/[^/]+/?$"),
]


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if any(r.match(clean) for r in ROUTES):
            path = "/index.html"
        return super().translate_path(path)

    def send_head(self):
        # SimpleHTTPRequestHandler는 숨은 파일을 막지 않는다. 막지 않으면 /.git/config 로
        # 저장소 이력 전체를 내려받을 수 있다. 로컬 전용 서버라도 열어둘 이유가 없다.
        clean = self.path.split("?", 1)[0].split("#", 1)[0]
        if any(part.startswith(".") for part in clean.split("/")):
            self.send_error(404)
            return None
        return super().send_head()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


class Server(socketserver.TCPServer):
    allow_reuse_address = True


# 127.0.0.1에만 묶는다. 빈 호스트("")로 두면 같은 와이파이의 아무나 이 저장소를 열 수 있다.
with Server(("127.0.0.1", PORT), Handler) as httpd:
    print(f"http://localhost:{PORT}  (Ctrl+C로 종료)")
    httpd.serve_forever()
