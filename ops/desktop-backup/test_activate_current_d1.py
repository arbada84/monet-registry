import unittest
import subprocess
from unittest.mock import patch

import activate_current_d1 as activation


class CurrentActivationTests(unittest.TestCase):
    def test_missing_authentication_never_starts_a_backup_or_timer(self):
        with patch.object(activation, 'activation_plan', return_value=[['backup'], ['timer']]), \
             patch.object(activation, 'check_credentials', side_effect=FileNotFoundError('credentials')), \
             patch.object(activation.subprocess, 'run') as run:
            with self.assertRaises(FileNotFoundError):
                activation.activate({})
        run.assert_not_called()

    def test_failed_actual_restore_never_enables_timer(self):
        with patch.object(activation, 'activation_plan', return_value=[['backup'], ['timer']]), \
             patch.object(activation, 'check_credentials'), \
             patch.object(activation, 'check_current_schedule', side_effect=RuntimeError('restore failed')), \
             patch.object(activation.subprocess, 'run') as run:
            with self.assertRaises(RuntimeError):
                activation.activate({})
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0], ['backup'])

    def test_actual_verified_backup_precedes_timer_activation(self):
        order = []
        with patch.object(activation, 'activation_plan', return_value=[['backup'], ['timer']]), \
             patch.object(activation, 'check_credentials'), \
             patch.object(activation, 'check_current_schedule', side_effect=lambda _: order.append('verify')), \
             patch.object(activation.subprocess, 'run', side_effect=lambda cmd, **_: order.append(cmd[0])):
            report = activation.activate({})
        self.assertEqual(order[:3], ['backup', 'verify', 'timer'])
        self.assertTrue(report['timerActivated'])

    def test_failed_bootstrap_never_checks_success_or_enables_timer(self):
        with patch.object(activation, 'activation_plan', return_value=[['backup'], ['timer']]), \
             patch.object(activation, 'check_credentials'), \
             patch.object(activation, 'check_current_schedule') as verify, \
             patch.object(activation.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['backup'])) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                activation.activate({})
        self.assertEqual(run.call_count, 1)
        verify.assert_not_called()


if __name__ == '__main__':
    unittest.main()
