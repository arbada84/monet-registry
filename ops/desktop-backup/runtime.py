#!/usr/bin/env python3
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time


CONFIG = Path.home() / '.config/culturepeople/desktop-backup.json'
ALLOWED_ENV = {
    'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_D1_DATABASE_ID', 'D1_DATABASE_ID',
    'CLOUDFLARE_D1_PROD_DB', 'D1_DATABASE_NAME',
    'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL',
    'CLOUDFLARE_R2_PUBLIC_BASE_URL', 'R2_PUBLIC_BASE_URL',
}


def private_file(path):
    path = Path(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError(f'Expected an owner-only regular file: {path}')
    return path


def load_config(path=CONFIG):
    config = json.loads(private_file(path).read_text())
    if config.get('formatVersion') != 1:
        raise RuntimeError('Unsupported backup configuration')
    if config.get('profile', 'full') not in ['full', 'current-d1']:
        raise RuntimeError('Unsupported backup profile')
    if len(config['volumes']) != 2 or {v['name'] for v in config['volumes']} != {'primary', 'second'}:
        raise RuntimeError('Both primary and second volumes are required')
    if len({v['deviceUuid'] for v in config['volumes']}) != 2:
        raise RuntimeError('Backup volumes must use distinct backing devices')
    for v in config['volumes']:
        if Path(v['mount']) in [Path.home() / 'culturepeople-backups', Path.home() / 'culturepeople-backups-second-copy']:
            raise RuntimeError('Encrypted mount must not overlap a legacy default backup path')
    if not config.get('installedFiles'):
        raise RuntimeError('Installed backup runtime hash manifest is missing')
    for name, digest in config['installedFiles'].items():
        if hashlib.sha256(private_file(name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Installed backup runtime or service file changed')
    return config


def volume(config, name):
    return next(v for v in config['volumes'] if v['name'] == name)


def backup_root(config, name):
    directory = 'd1-current' if config.get('profile') == 'current-d1' else 'backups'
    return Path(volume(config, name)['mount'], directory)


def check_current_handoff(config):
    declaration = json.loads(private_file(config['ownerHandoffFile']).read_text())
    if (declaration.get('basis') != 'owner-declaration' or
            declaration.get('writer') != 'desktop' or
            declaration.get('previousBackupStopped') is not True or
            not declaration.get('recordedAt') or not declaration.get('statement')):
        raise RuntimeError('Explicit owner handoff declaration is required')


def check_current_schedule(config):
    check_current_handoff(config)
    result = json.loads(private_file(Path(config['stateDir'], 'current-d1-result.json')).read_text())
    if (result.get('ok') is not True or result.get('fixtureOnly') or
            result.get('profile') != 'current-d1' or
            result.get('sourceSha') != config['sourceSha'] or
            result.get('secureArchivesVerified') is not True or not result.get('runId')):
        raise RuntimeError('A real current D1 backup with both restores is required')
    archives = result.get('archives', [])
    if len(archives) != 2 or len(set(archives)) != 2:
        raise RuntimeError('Two distinct verified current D1 archives are required')
    restored_archives = set()
    for item in result.get('secureRestoreReports', []):
        restore = evidence_report({'restore': item}, 'restore')
        if (not restore.get('ok') or restore.get('fixtureOnly') or
                not restore.get('archiveSha256Verified') or restore.get('archivePath') not in archives):
            raise RuntimeError('Invalid current D1 secure restore evidence')
        restored_archives.add(restore['archivePath'])
    if len(result.get('secureRestoreReports', [])) != 2:
        raise RuntimeError('Both current D1 secure restore reports are required')
    if restored_archives != set(archives):
        raise RuntimeError('Current D1 restore proofs must cover both archives')


def mounted_volume(v):
    try:
        mounted = json.loads(output(['findmnt', '--json', '-T', v['mount'], '-o', 'TARGET,FSTYPE']))['filesystems'][0]
    except subprocess.CalledProcessError:
        return False
    return mounted['fstype'] == 'fuse.gocryptfs' and Path(mounted['target']) == Path(v['mount'])


def output(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()


def check_backing(v):
    actual = output(['findmnt', '-n', '-o', 'UUID', '-T', v['cipher']])
    if actual != v['deviceUuid']:
        raise RuntimeError(f"Backing device mismatch for {v['name']}")
    if not Path(v['cipher'], 'gocryptfs.conf').is_file():
        raise RuntimeError(f"Missing encrypted volume configuration for {v['name']}")


def check_volume(v):
    check_backing(v)
    if not mounted_volume(v):
        raise RuntimeError(f"Encrypted volume is not mounted at {v['mount']}")
    identity = Path(v['mount'], '.culturepeople-volume-id')
    if private_file(identity).read_text().strip() != v['volumeId']:
        raise RuntimeError(f"Volume identity mismatch for {v['name']}")
    info = os.statvfs(v['mount'])
    if info.f_bavail * info.f_frsize < 10 * 1024**3:
        raise RuntimeError(f"Less than 10 GiB available on {v['name']}")


def check_runtime(config):
    root = config['runtime']
    if output(['git', '-C', root, 'rev-parse', 'HEAD']) != config['sourceSha']:
        raise RuntimeError('Backup runtime source SHA changed')
    if output(['git', '-C', root, 'status', '--porcelain', '--untracked-files=normal']):
        raise RuntimeError('Backup runtime worktree is dirty')
    if not output([config['node'], '--version']).startswith('v24.'):
        raise RuntimeError('Node 24 is required')


def check_cutover(config, rehearsal=False):
    evidence = json.loads(private_file(config['cutoverEvidenceFile']).read_text())
    required = ['laptopTimersStopped', 'laptopServicesInactive']
    if not rehearsal:
        required += ['legacyDataRestored', 'desktopFullBackupVerified',
                     'bothSecureRestoresVerified', 'offHostKeysVerified']
    if evidence.get('writer') != 'desktop' or not all(evidence.get(k) is True for k in required):
        raise RuntimeError('Desktop writer cutover has not been verified')
    if not evidence.get('laptopHostname') or not evidence.get('verifiedAt'):
        raise RuntimeError('Laptop shutdown evidence is incomplete')
    report = evidence_report(evidence, 'laptopStopReport')
    if report.get('hostname') != evidence['laptopHostname']:
        raise RuntimeError('Laptop shutdown report hostname mismatch')
    timer_names = ['culturepeople-local-backup', 'culturepeople-local-image-backfill',
                   'culturepeople-weekly-restore', 'culturepeople-backup-health']
    for name in timer_names:
        timer = report.get('units', {}).get(name + '.timer', {})
        service = report.get('units', {}).get(name + '.service', {})
        if timer.get('activeState') != 'inactive' or timer.get('unitFileState') not in ['disabled', 'masked', 'not-found']:
            raise RuntimeError('A laptop backup timer is active or its stop evidence is missing')
        if service.get('activeState') not in ['inactive', 'failed']:
            raise RuntimeError('A laptop backup service is active or its stop evidence is missing')
        if not rehearsal and (timer.get('unitFileState') != 'masked' or service.get('unitFileState') != 'masked'):
            raise RuntimeError('Permanent laptop timer and service masking is required before scheduling')
    if not rehearsal:
        allowed_full_reports = {Path(config['stateDir'], name).resolve()
                                for name in ['rehearse-result.json', 'run-result.json']}
        if Path(evidence.get('fullBackupReport', {}).get('path', '')).resolve() not in allowed_full_reports:
            raise RuntimeError('Full backup proof must come from this desktop runtime')
        full = evidence_report(evidence, 'fullBackupReport')
        legacy = evidence_report(evidence, 'legacyRestoreReport')
        keys = evidence_report(evidence, 'keysRecoveryReport')
        if full.get('fixtureOnly') or not full.get('ok') or not full.get('secureArchivesVerified'):
            raise RuntimeError('A verified full backup report is required')
        if not full.get('runId') or full.get('sourceSha') != config['sourceSha']:
            raise RuntimeError('Full backup proof does not identify the fixed runtime and run')
        if not legacy.get('ok') or legacy.get('destination') != str(backup_root(config, 'primary')):
            raise RuntimeError('Legacy restore proof does not match the configured backup root')
        if not keys.get('ok') or not keys.get('offHostLocation'):
            raise RuntimeError('Off-host key recovery proof is missing')
        for key, field in [('volumeKeyFile', 'volumeKeySha256'), ('archiveKeyFile', 'archiveKeySha256')]:
            if keys.get(field) != hashlib.sha256(private_file(config[key]).read_bytes()).hexdigest():
                raise RuntimeError('Off-host recovery key hash mismatch')
        restores = [evidence_report(evidence, field) for field in ['securePrimaryReport', 'secureSecondReport']]
        if not all(not r.get('fixtureOnly') and r.get('ok') and r.get('archiveSha256Verified') for r in restores):
            raise RuntimeError('Both secure restore proofs are required')
        if len({r.get('archivePath') for r in restores}) != 2 or not all(r.get('archivePath') for r in restores):
            raise RuntimeError('Secure restore proofs must refer to distinct archives')
        if {r['archivePath'] for r in restores} != set(full.get('archives', [])):
            raise RuntimeError('Secure restore proofs belong to a different backup run')


def evidence_report(evidence, name):
    item = evidence.get(name, {})
    if not item.get('path') or not item.get('sha256'):
        raise RuntimeError(f'Missing evidence artifact: {name}')
    body = private_file(item['path']).read_bytes()
    if hashlib.sha256(body).hexdigest() != item['sha256']:
        raise RuntimeError(f'Evidence hash mismatch: {name}')
    return json.loads(body)


def child_env(config):
    env = {k: os.environ[k] for k in ['HOME', 'USER', 'LANG', 'TZ'] if k in os.environ}
    env['PATH'] = '/home/arbada/.local/bin:/usr/bin:/bin'
    for line in private_file(config['credentialsFile']).read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or key not in ALLOWED_ENV:
            raise RuntimeError('Unexpected variable in backup credentials file')
        env[key] = value.strip().strip('"\'')
    if not env.get('CLOUDFLARE_API_TOKEN') or not env.get('CLOUDFLARE_ACCOUNT_ID'):
        raise RuntimeError('D1 backup credentials are missing')
    env['CULTUREPEOPLE_BACKUP_ROOT'] = str(backup_root(config, 'primary'))
    env['CULTUREPEOPLE_BACKUP_SECOND_COPY'] = str(backup_root(config, 'second'))
    env['TMPDIR'] = str(Path(volume(config, 'primary')['mount'], 'tmp'))
    Path(env['TMPDIR']).mkdir(mode=0o700, exist_ok=True)
    return env


def run_json(config, env, script, args, log):
    command = [config['node'], str(Path(config['runtime'], 'scripts', script)), *args]
    result = subprocess.run(command, cwd=config['runtime'], env=env,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=7200)
    with open(log, 'a') as f:
        f.write(json.dumps({'script': script, 'exitCode': result.returncode}) + '\n')
        f.write(result.stdout + '\n' + result.stderr + '\n')
    if result.returncode:
        raise RuntimeError(f'{script} failed; details are in the encrypted log')
    return json.loads(result.stdout)


def execute(config, action):
    for v in config['volumes']:
        check_volume(v)
    check_runtime(config)
    current_d1 = config.get('profile') == 'current-d1'
    if current_d1:
        check_current_handoff(config)
    elif action != 'sample':
        check_cutover(config, rehearsal=action == 'rehearse')
    env = child_env(config)
    root = backup_root(config, 'primary')
    root.mkdir(mode=0o700, exist_ok=True)
    backup_root(config, 'second').mkdir(mode=0o700, exist_ok=True)
    logs = root / '_logs'
    logs.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    log = logs / f'desktop-backup-{stamp}.log'
    with open(root / '.desktop-runtime.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'sample':
            sample_root = Path(volume(config, 'primary')['mount'], 'preflight')
            result = run_json(config, env, 'local-culturepeople-backup.mjs', [
                '--out', str(sample_root), '--sample', '--max-rows', '1',
                '--d1-tables', 'articles,site_settings', '--skip-supabase',
                '--no-media', '--no-env-files'], log)
            return {'ok': result['ok'], 'scope': 'bounded D1 sample only',
                    'd1Rows': result['d1']['rows'], 'mergedArticles': result['mergedArticles'],
                    'fullBackupVerified': False}
        if current_d1:
            result = run_current_d1(config, env, root, log)
        else:
            fallback = Path(volume(config, 'primary')['mount'], 'supabase-fallback')
            if not (fallback / 'export-manifest.json').is_file():
                raise RuntimeError('Legacy Supabase fallback has not been restored')
            result = run_json(config, env, 'run-local-backup-quiet.mjs', [
                '--root', str(root), '--second-copy', str(backup_root(config, 'second')),
                '--no-env-files', '--max-new-media', '30', '--supabase-fallback-dir', str(fallback),
                '--json'], log)
        if not result.get('ok'):
            raise RuntimeError('Backup chain did not verify successfully')
        key_file = str(private_file(config['archiveKeyFile']))
        archives = []
        restore_reports = []
        for v in config['volumes']:
            target = str(Path(v['mount'], 'secure-archives'))
            plan_file = str(Path(env['TMPDIR'], f"secure-{v['name']}-{stamp}.json"))
            common = ['--root', str(root), '--target', target, '--key-file', key_file, '--json']
            plan = run_json(config, env, 'secure-local-backup-copy.mjs', [
                *common, '--report', plan_file], log)
            archive = run_json(config, env, 'secure-local-backup-copy.mjs', [
                *common, '--apply', '--plan', plan_file, '--plan-id', plan['planId'],
                '--confirm', 'APPLY_SECURE_BACKUP'], log)
            restore_file = Path(config['stateDir'], f"secure-restore-{v['name']}-{stamp}.json")
            restore = run_json(config, env, 'restore-secure-local-backup.mjs', [
                '--archive', archive['archivePath'], '--key-file', key_file,
                '--report', str(restore_file),
                '--json'], log)
            if not restore.get('ok') or not restore.get('archiveSha256Verified'):
                raise RuntimeError(f"Secure restore failed for {v['name']}")
            archives.append(archive['archivePath'])
            restore_reports.append({'path': str(restore_file),
                                    'sha256': hashlib.sha256(private_file(restore_file).read_bytes()).hexdigest()})
        if len(set(archives)) != 2:
            raise RuntimeError('Two distinct secure archives were not produced')
        return {'ok': True, 'scope': 'current D1 only; legacy Supabase and media not included' if current_d1
                else 'backup, SQLite, second copy and both secure restores',
                'profile': 'current-d1' if current_d1 else 'full',
                'legacyRestoreRequired': not current_d1,
                'mediaIncluded': not current_d1, 'secureRestoreReports': restore_reports,
                'secureArchivesVerified': True, 'archives': archives, 'log': str(log),
                'runId': stamp, 'sourceSha': config['sourceSha']}


def run_current_d1(config, env, root, log):
    result = run_json(config, env, 'local-culturepeople-backup.mjs', [
        '--out', str(root), '--all-tables', '--skip-supabase', '--no-media',
        '--no-env-files', '--d1-page-size', '250', '--d1-delay-ms', '300'], log)
    if not result.get('ok') or not result.get('d1', {}).get('ok') or not result.get('mergedArticles'):
        raise RuntimeError('Current D1 export failed or contains no articles')
    for script, args in [
        ('create-local-backup-sqlite.mjs', ['--latest', '--root', str(root)]),
        ('verify-local-culturepeople-backup.mjs', ['--latest', '--root', str(root), '--require-sqlite', '--json']),
        ('restore-local-culturepeople-backup.mjs', ['--latest', '--root', str(root), '--json']),
        ('sync-local-backup-copy.mjs', ['--source', str(root), '--target', str(backup_root(config, 'second')), '--apply', '--json']),
        ('restore-local-backup-copies.mjs', ['--root', str(root), '--second-copy', str(backup_root(config, 'second')), '--json']),
    ]:
        step = run_json(config, env, script, args, log)
        if step.get('ok') is not True:
            raise RuntimeError(f'Current D1 verification failed: {script}')
    return {'ok': True}


def save_result(config, action, result):
    result['observedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result['sourceSha'] = config['sourceSha']
    target = Path(config['stateDir'], f'{action}-result.json')
    temporary = target.with_suffix('.json.new')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(target)


def readiness(config):
    checks = []
    probes = [('fixedRuntime', lambda: check_runtime(config)),
              ('credentials', lambda: private_file(config['credentialsFile'])),
              ('rehearsalEvidence', lambda: check_cutover(config, rehearsal=True)),
              ('scheduleEvidence', lambda: check_cutover(config))]
    if config.get('profile') == 'current-d1':
        probes = probes[:2] + [('ownerHandoff', lambda: check_current_handoff(config)),
                              ('scheduleEvidence', lambda: check_current_schedule(config))]
    for name, probe in probes:
        try:
            probe()
            checks.append({'name': name, 'ok': True})
        except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError) as exc:
            checks.append({'name': name, 'ok': False, 'reason': str(exc)})
    return {'ok': all(item['ok'] for item in checks), 'mode': 'read-only',
            'profile': config.get('profile', 'full'),
            'checks': checks, 'readOnlyPermission': 'unverified',
            'backupExecuted': False, 'timerChanged': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['readiness', 'check-backing', 'mount', 'wait-mount', 'unmount', 'check', 'sample', 'rehearse', 'run'])
    parser.add_argument('--volume', choices=['primary', 'second'])
    args = parser.parse_args()
    os.umask(0o077)
    config = load_config()
    if args.action == 'readiness':
        result = readiness(config)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result['ok'] else 1
    if args.action in ['check-backing', 'mount', 'wait-mount', 'unmount']:
        if not args.volume:
            raise RuntimeError('--volume is required')
        v = volume(config, args.volume)
        if args.action == 'unmount':
            if not mounted_volume(v):
                raise RuntimeError('Refuse to unmount an unexpected filesystem')
            subprocess.run(['/usr/bin/fusermount3', '-u', v['mount']], check=True)
            Path(v['mount']).chmod(0o000)
        elif args.action == 'wait-mount':
            for _ in range(150):
                if mounted_volume(v):
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError('Encrypted mount did not become ready within 15 seconds')
        else:
            check_backing(v)
            if args.action == 'mount':
                key = private_file(config['volumeKeyFile'])
                Path(v['mount']).mkdir(mode=0o700, parents=True, exist_ok=True)
                Path(v['mount']).chmod(0o700)
                try:
                    result = subprocess.run([config['gocryptfs'], '-fg', '-q',
                             '-passfile', str(key), v['cipher'], v['mount']])
                    if result.returncode:
                        raise RuntimeError('Encrypted mount process failed')
                finally:
                    if not mounted_volume(v):
                        Path(v['mount']).chmod(0o000)
        result = {'ok': True, 'volume': args.volume}
    elif args.action == 'check':
        for v in config['volumes']:
            check_volume(v)
        check_runtime(config)
        result = {'ok': True, 'scope': 'encrypted mounts and fixed runtime only'}
    else:
        try:
            result = execute(config, args.action)
        except Exception as exc:
            save_result(config, args.action, {'ok': False, 'error': str(exc)})
            if config.get('profile') == 'current-d1':
                save_result(config, 'current-d1', {'ok': False, 'profile': 'current-d1', 'error': str(exc)})
            raise
        save_result(config, args.action, result)
        if config.get('profile') == 'current-d1':
            save_result(config, 'current-d1', result.copy())
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False))
        sys.exit(1)
