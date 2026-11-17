import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup_runtime', Path(__file__).with_name('runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class BackupSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.config = {'cutoverEvidenceFile': str(self.root / 'cutover.json')}

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, name, content, mode=0o600):
        path = self.root / name
        path.write_text(content)
        path.chmod(mode)
        return path

    def test_world_readable_credentials_are_rejected(self):
        path = self.write('credentials', 'CLOUDFLARE_API_TOKEN=fixture', 0o644)
        with self.assertRaises(RuntimeError):
            runtime.private_file(path)

    def test_readiness_reports_missing_credentials_without_running_backup(self):
        config = {**self.config, 'credentialsFile': str(self.root / 'absent')}
        with patch.object(runtime, 'check_runtime'), patch.object(runtime, 'execute') as execute:
            report = runtime.readiness(config)
        execute.assert_not_called()
        self.assertFalse(report['ok'])
        self.assertFalse(report['backupExecuted'])
        self.assertFalse(report['timerChanged'])
        self.assertEqual(len(report['checks']), 4)

    def test_readiness_can_pass_without_mounting_or_contacting_services(self):
        path = self.write('credential', 'fixture')
        with patch.object(runtime, 'check_runtime'), patch.object(runtime, 'check_cutover'), \
             patch.object(runtime, 'check_volume') as mount:
            report = runtime.readiness({'credentialsFile': str(path)})
        self.assertTrue(report['ok'])
        mount.assert_not_called()

    def test_symlink_credentials_are_rejected(self):
        target = self.write('original', 'fixture')
        link = self.root / 'link'
        link.symlink_to(target)
        with self.assertRaises(RuntimeError):
            runtime.private_file(link)

    def test_existing_directory_on_unencrypted_disk_is_rejected(self):
        v = {'cipher': str(self.root), 'mount': str(self.root), 'deviceUuid': 'disk-a', 'name': 'primary'}
        self.write('gocryptfs.conf', '{}')
        with patch.object(runtime, 'output', side_effect=['disk-a', json.dumps({'filesystems': [
                {'target': str(self.root), 'fstype': 'ext4'}]})]):
            with self.assertRaisesRegex(RuntimeError, 'not mounted'):
                runtime.check_volume(v)

    def test_wrong_backing_disk_is_rejected(self):
        with patch.object(runtime, 'output', return_value='wrong-disk'):
            with self.assertRaisesRegex(RuntimeError, 'device mismatch'):
                runtime.check_backing({'cipher': str(self.root), 'deviceUuid': 'expected', 'name': 'second'})

    def test_wrong_volume_identity_is_rejected(self):
        v = {'cipher': str(self.root), 'mount': str(self.root), 'deviceUuid': 'disk-a',
             'name': 'primary', 'volumeId': 'expected'}
        self.write('gocryptfs.conf', '{}')
        self.write('.culturepeople-volume-id', 'wrong')
        with patch.object(runtime, 'output', side_effect=['disk-a', json.dumps({'filesystems': [
                {'target': str(self.root), 'fstype': 'fuse.gocryptfs'}]})]):
            with self.assertRaisesRegex(RuntimeError, 'identity mismatch'):
                runtime.check_volume(v)

    def test_absent_laptop_stop_evidence_prevents_remote_execution(self):
        with patch.object(runtime, 'check_volume'), patch.object(runtime, 'check_runtime'), \
             patch.object(runtime, 'child_env') as child:
            with self.assertRaises(FileNotFoundError):
                runtime.execute({**self.config, 'volumes': []}, 'run')
            child.assert_not_called()

    def test_laptop_release_permits_rehearsal_but_not_unverified_schedule(self):
        units = {}
        for name in ['culturepeople-local-backup', 'culturepeople-local-image-backfill',
                     'culturepeople-weekly-restore', 'culturepeople-backup-health']:
            units[name + '.timer'] = {'activeState': 'inactive', 'unitFileState': 'disabled'}
            units[name + '.service'] = {'activeState': 'inactive'}
        report = self.write('laptop-report.json', json.dumps({'hostname': 'fixture-laptop', 'units': units}))
        self.write('cutover.json', json.dumps({'writer': 'desktop', 'laptopTimersStopped': True,
                   'laptopServicesInactive': True, 'laptopHostname': 'fixture-laptop',
                   'verifiedAt': '2026-11-16T00:00:00Z', 'laptopStopReport': {
                       'path': str(report), 'sha256': hashlib.sha256(report.read_bytes()).hexdigest()}}))
        runtime.check_cutover(self.config, rehearsal=True)
        with self.assertRaises(RuntimeError):
            runtime.check_cutover(self.config)

    def test_same_disk_cannot_be_presented_as_independent_second_copy(self):
        path = self.write('config.json', json.dumps({'formatVersion': 1, 'volumes': [
            {'name': 'primary', 'deviceUuid': 'same'}, {'name': 'second', 'deviceUuid': 'same'}]}))
        with self.assertRaisesRegex(RuntimeError, 'distinct backing devices'):
            runtime.load_config(path)

    def test_secure_archive_target_is_outside_plaintext_backup_root(self):
        config = {'volumes': [{'name': 'primary', 'mount': str(self.root)}]}
        source = runtime.backup_root(config, 'primary')
        archive = self.root / 'secure-archives'
        self.assertFalse(archive.is_relative_to(source))
        self.assertTrue(archive.is_relative_to(self.root))

    def test_legacy_default_mount_path_is_rejected(self):
        path = self.write('config.json', json.dumps({'formatVersion': 1, 'volumes': [
            {'name': 'primary', 'deviceUuid': 'one', 'mount': str(Path.home() / 'culturepeople-backups')},
            {'name': 'second', 'deviceUuid': 'two', 'mount': str(self.root)}]}))
        with self.assertRaisesRegex(RuntimeError, 'legacy default'):
            runtime.load_config(path)

    def test_cutover_booleans_without_actual_evidence_are_rejected(self):
        self.write('cutover.json', json.dumps({'writer': 'desktop', 'laptopTimersStopped': True,
                   'laptopServicesInactive': True, 'laptopHostname': 'fixture-laptop',
                   'verifiedAt': '2026-11-16T00:00:00Z'}))
        with self.assertRaisesRegex(RuntimeError, 'Missing evidence artifact'):
            runtime.check_cutover(self.config, rehearsal=True)

    def test_changed_evidence_artifact_is_rejected(self):
        path = self.write('evidence.json', '{"ok":true}')
        item = {'report': {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}}
        path.write_text('{"ok":false}')
        with self.assertRaisesRegex(RuntimeError, 'Evidence hash mismatch'):
            runtime.evidence_report(item, 'report')

    def test_failure_replaces_previous_success_result(self):
        config = {'sourceSha': 'fixture-source', 'stateDir': str(self.root)}
        runtime.save_result(config, 'run', {'ok': True})
        runtime.save_result(config, 'run', {'ok': False, 'error': 'fixture failure'})
        report = json.loads((self.root / 'run-result.json').read_text())
        self.assertFalse(report['ok'])
        self.assertEqual(report['sourceSha'], 'fixture-source')
        self.assertIn('observedAt', report)

    def test_fixture_report_cannot_authorize_production_schedule(self):
        units = {}
        for name in ['culturepeople-local-backup', 'culturepeople-local-image-backfill',
                     'culturepeople-weekly-restore', 'culturepeople-backup-health']:
            for suffix in ['.timer', '.service']:
                units[name + suffix] = {'activeState': 'inactive', 'unitFileState': 'masked'}
        evidence = {'writer': 'desktop', 'laptopHostname': 'fixture-laptop', 'verifiedAt': 'fixture',
                    'laptopTimersStopped': True, 'laptopServicesInactive': True,
                    'legacyDataRestored': True, 'desktopFullBackupVerified': True,
                    'bothSecureRestoresVerified': True, 'offHostKeysVerified': True}
        reports = {'laptopStopReport': ('laptop.json', {'hostname': 'fixture-laptop', 'units': units}),
                   'fullBackupReport': ('rehearse-result.json', {'ok': True, 'secureArchivesVerified': True,
                                                              'fixtureOnly': True}),
                   'legacyRestoreReport': ('legacy.json', {}), 'keysRecoveryReport': ('keys.json', {})}
        for field, (name, content) in reports.items():
            path = self.write(name, json.dumps(content))
            evidence[field] = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        self.write('cutover.json', json.dumps(evidence))
        with self.assertRaisesRegex(RuntimeError, 'verified full backup report'):
            runtime.check_cutover({**self.config, 'stateDir': str(self.root)})


if __name__ == '__main__':
    unittest.main()
