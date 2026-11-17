#!/usr/bin/env python3
"""Connect desktop backup credentials without printing or passing the token in argv."""
import argparse
import getpass
import json
import os
import re
from pathlib import Path
import stat
import sys
import urllib.error
import urllib.request


DIRECTORY = Path.home() / '.config/culturepeople'


def load_private(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('Credential configuration must be an owner-only regular file')
    return json.loads(path.read_text())


def probe(config, token):
    account = config['CLOUDFLARE_ACCOUNT_ID']
    database = config['CLOUDFLARE_D1_DATABASE_ID']
    endpoint = f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query'
    request = urllib.request.Request(endpoint, data=json.dumps({'sql': 'SELECT 1 AS backup_read_probe'}).encode(),
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'D1 read probe failed with HTTP {exc.code}; no credentials were saved') from None
    if not result.get('success') or not result.get('result') or not result['result'][0].get('success'):
        raise RuntimeError('D1 did not confirm the read probe; no credentials were saved')
    rows = result['result'][0].get('results', [])
    if not rows or rows[0].get('backup_read_probe') != 1:
        raise RuntimeError('Unexpected D1 read probe result; no credentials were saved')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    config = load_private(DIRECTORY / 'desktop-d1-connection.json')
    target = DIRECTORY / 'desktop-backup.env'
    if args.check:
        print(json.dumps({'desktopConnectionPrepared': True, 'credentialFileExists': target.exists(),
                          'readProbe': 'not_run', 'readOnlyPermission': 'unverified',
                          'tokenValuesIncluded': False, 'laptopRequiredForNewConnection': False}))
        return
    if not sys.stdin.isatty():
        raise RuntimeError('Run this command in an interactive desktop terminal; do not send a token in chat')
    token = getpass.getpass('Cloudflare D1 Read API token (hidden): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,256}', token):
        raise RuntimeError('Expected a valid Cloudflare API token; input value was not printed')
    probe(config, token)
    lines = {**config, 'CLOUDFLARE_API_TOKEN': token}
    body = ''.join(key + '=' + value + '\n' for key, value in sorted(lines.items()))
    os.umask(0o077)
    if target.exists():
        info = target.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('Existing credential file is not private; preserved without changes')
        if target.read_text() != body:
            raise RuntimeError('A different credential file already exists; preserved without changes')
    else:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(body)
    print('D1 read probe passed. Desktop backup credentials saved with mode 0600. '
          'Read-only permission remains unverified: SELECT does not prove absence of write access. '
          'Token value was not printed.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
