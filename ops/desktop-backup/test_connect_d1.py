import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('desktop_connect', Path(__file__).with_name('connect_d1.py'))
connect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connect)


class DesktopConnectionTests(unittest.TestCase):
    def test_success_saves_token_privately_without_printing_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            config = directory / 'desktop-d1-connection.json'
            config.write_text(json.dumps({'CLOUDFLARE_ACCOUNT_ID': 'fixture', 'CLOUDFLARE_D1_DATABASE_ID': 'fixture'}))
            config.chmod(0o600)
            token = 'fixture_token_not_a_real_credential'
            response = io.BytesIO(json.dumps({'success': True, 'result': [
                {'success': True, 'results': [{'backup_read_probe': 1}]}]}).encode())
            output = io.StringIO()
            with patch.object(connect, 'DIRECTORY', directory), patch('sys.argv', ['connect_d1.py']), \
                 patch('sys.stdin.isatty', return_value=True), patch.object(connect.getpass, 'getpass', return_value=token), \
                 patch.object(connect.urllib.request, 'urlopen', return_value=response) as request, \
                 contextlib.redirect_stdout(output):
                connect.main()
            credential = directory / 'desktop-backup.env'
            self.assertEqual(credential.stat().st_mode & 0o777, 0o600)
            self.assertIn(token, credential.read_text())
            self.assertNotIn(token, output.getvalue())
            self.assertIn('Read-only permission remains unverified', output.getvalue())
            sql = json.loads(request.call_args.args[0].data)['sql']
            self.assertEqual(sql, 'SELECT 1 AS backup_read_probe')

    def test_failed_auth_does_not_save_credentials_or_echo_token(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            config = directory / 'desktop-d1-connection.json'
            config.write_text(json.dumps({'CLOUDFLARE_ACCOUNT_ID': 'fixture', 'CLOUDFLARE_D1_DATABASE_ID': 'fixture'}))
            config.chmod(0o600)
            token = 'fixture_token_not_a_real_credential'
            error = urllib.error.HTTPError('https://api.cloudflare.com', 403, 'Forbidden', None, None)
            with patch.object(connect, 'DIRECTORY', directory), patch('sys.argv', ['connect_d1.py']), \
                 patch('sys.stdin.isatty', return_value=True), patch.object(connect.getpass, 'getpass', return_value=token), \
                 patch.object(connect.urllib.request, 'urlopen', side_effect=error):
                with self.assertRaises(RuntimeError) as raised:
                    connect.main()
            self.assertNotIn(token, str(raised.exception))
            self.assertFalse((directory / 'desktop-backup.env').exists())

    def test_check_does_not_claim_probe_or_permission_verification(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            config = directory / 'desktop-d1-connection.json'
            config.write_text('{}')
            config.chmod(0o600)
            output = io.StringIO()
            with patch.object(connect, 'DIRECTORY', directory), patch('sys.argv', ['connect_d1.py', '--check']), \
                 patch.object(connect, 'probe') as probe, contextlib.redirect_stdout(output):
                connect.main()
            probe.assert_not_called()
            self.assertEqual(json.loads(output.getvalue())['readOnlyPermission'], 'unverified')

    def test_check_cannot_accidentally_activate_a_backup(self):
        with patch('sys.argv', ['connect_d1.py', '--check', '--activate-backup']), \
             patch.object(connect, 'load_private') as load, patch.object(connect.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'cannot activate'):
                connect.main()
        load.assert_not_called()
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
