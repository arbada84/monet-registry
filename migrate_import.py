import requests
import re
import urllib3
urllib3.disable_warnings()

BASE = "http://phpmyadmin.netproserv.com"
session = requests.Session()
session.verify = False

# 1. Get login page token
resp = session.get(f"{BASE}/index.php")
token = re.search(r'name="token"\s+value="([^"]+)"', resp.text).group(1)
print(f"Token: {token}")

# 2. Login
resp = session.post(f"{BASE}/index.php", data={
    "pma_username": "arbada",
    "pma_password": "yrsr0611",
    "server": "1",
    "target": "index.php",
    "lang": "en",
    "collation_connection": "utf8_general_ci",
    "token": token,
})

# Get new token
m = re.search(r'"token":"([^"]+)"', resp.text)
if m:
    token = m.group(1)
print(f"Logged in, token: {token}")

# 3. Import SQL file via phpMyAdmin import
with open("migration.sql", "rb") as f:
    sql_content = f.read()

resp = session.post(f"{BASE}/import.php", data={
    "server": "1",
    "db": "test",
    "token": token,
    "import_type": "database",
    "format": "sql",
    "sql_compatibility": "NONE",
    "sql_no_auto_value_on_zero": "something",
    "charset_of_file": "utf-8",
}, files={
    "import_file": ("migration.sql", sql_content, "application/sql"),
})

if "success" in resp.text.lower() or "ic_s_success" in resp.text:
    print("Import SUCCESS!")
    # Extract summary
    success_msgs = re.findall(r'class="success"[^>]*>(.*?)</div>', resp.text, re.DOTALL)
    for msg in success_msgs:
        clean = re.sub(r'<[^>]+>', '', msg).strip()
        if clean:
            print(f"  {clean}")
else:
    # Check for specific errors
    errors = re.findall(r'class="error"[^>]*>(.*?)</div>', resp.text, re.DOTALL)
    for err in errors:
        clean = re.sub(r'<[^>]+>', '', err).strip()
        print(f"  ERROR: {clean}")

# Get new token from response
m2 = re.search(r'token=([a-f0-9]{32})', resp.text)
if m2:
    token = m2.group(1)

# 4. Verify - check tables
print("\n=== Verification ===")
resp = session.post(f"{BASE}/sql.php", data={
    "server": "1", "db": "test", "token": token,
    "sql_query": "SHOW TABLES",
})
tables = re.findall(r'<td[^>]*>\s*(articles|comments|categories|reporters)\s*</td>', resp.text)
print(f"Tables found: {tables}")

# Check counts
for table in ["articles", "comments", "categories", "reporters"]:
    resp = session.post(f"{BASE}/sql.php", data={
        "server": "1", "db": "test", "token": token,
        "sql_query": f"SELECT COUNT(*) as cnt FROM {table}",
    })
    cnt = re.search(r'<td[^>]*>\s*(\d+)\s*</td>', resp.text)
    if cnt:
        print(f"  {table}: {cnt.group(1)} rows")
    else:
        print(f"  {table}: could not read count")

print("\nDone!")
