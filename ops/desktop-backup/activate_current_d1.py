#!/usr/bin/env python3
"""Activate the owner-authorized current D1 backup after a real verified run."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from runtime import (load_config, private_file, check_runtime, check_current_handoff,
                     check_current_schedule, ALLOWED_ENV)


def activation_plan(config):
    if config.get('profile') != 'current-d1':
        raise RuntimeError('Activation requires the separate current-d1 profile')
    check_runtime(config)
    check_current_handoff(config)
    for name in ['volumeKeyFile', 'archiveKeyFile']:
        private_file(config[name])
    wrapper = str(Path.home() / '.local/lib/culturepeople-desktop-backup/runtime.py')
    return [
        ['systemd-run', '--user', '--wait', '--collect',
         '--unit=culturepeople-current-d1-bootstrap',
         '--property=Requires=culturepeople-backup-vault@primary.service culturepeople-backup-vault@second.service',
         '--property=After=culturepeople-backup-vault@primary.service culturepeople-backup-vault@second.service',
         '--property=UMask=0077', '--property=Nice=19', '--property=MemoryMax=4G',
         '--property=TimeoutStartSec=6h', '/usr/bin/python3', wrapper, 'rehearse'],
        ['systemctl', '--user', 'enable', '--now', 'culturepeople-desktop-backup.timer'],
    ]


def check_credentials(config):
    values = {}
    for line in private_file(config['credentialsFile']).read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or key not in ALLOWED_ENV:
            raise RuntimeError('Unexpected backup credential variable')
        values[key] = value.strip().strip('"\'')
    if not all(values.get(key) for key in ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']):
        raise RuntimeError('D1 authentication is missing; no backup or timer activation was attempted')


def activate(config):
    plan = activation_plan(config)
    check_credentials(config)
    subprocess.run(plan[0], check=True)
    check_current_schedule(config)
    subprocess.run(plan[1], check=True)
    subprocess.run(['systemctl', '--user', 'is-enabled', 'culturepeople-desktop-backup.timer'], check=True)
    subprocess.run(['systemctl', '--user', 'is-active', 'culturepeople-desktop-backup.timer'], check=True)
    return {'ok': True, 'profile': 'current-d1', 'backupAndBothRestoresVerified': True,
            'timerActivated': True, 'legacyArchivesChanged': False, 'secretValuesIncluded': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    config = load_config()
    if not args.apply:
        print(json.dumps({'mode': 'dry-run', 'commands': activation_plan(config),
                          'scope': 'current D1 only; no legacy Supabase or media restoration',
                          'timerChanged': False, 'backupExecuted': False}))
        return
    print(json.dumps(activate(config)))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc), 'secretValuesIncluded': False}), file=sys.stderr)
        sys.exit(1)
