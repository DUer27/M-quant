"""Retry transient Windows file contention without publishing incomplete JSON."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from market_data_refresh import atomic_json
import os


class AtomicJsonTests(unittest.TestCase):
    def test_transient_busy_destination_retries_and_readers_keep_old_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'status.json'
            atomic_json(path, {'state': 'old'})
            replace = os.replace
            calls = []
            def busy(source, destination):
                calls.append(1)
                if len(calls) <= 3:
                    self.assertEqual(json.loads(path.read_text()), {'state': 'old'})
                    raise PermissionError('fixture sharing conflict')
                return replace(source, destination)
            with patch('market_data_refresh.os.replace', side_effect=busy), patch('market_data_refresh.time.sleep') as delay:
                atomic_json(path, {'state': 'complete'})
            self.assertEqual(len(calls), 4)
            self.assertEqual(delay.call_count, 3)
            self.assertEqual(json.loads(path.read_text()), {'state': 'complete'})
            self.assertFalse(list(Path(directory).glob('*.tmp')))

    def test_persistent_permission_failure_is_bounded_and_retains_old_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'status.json'
            atomic_json(path, {'state': 'old'})
            with patch('market_data_refresh.os.replace', side_effect=PermissionError('fixture denied')) as replace, \
                 patch('market_data_refresh.time.sleep') as delay:
                with self.assertRaises(PermissionError): atomic_json(path, {'state': 'new'})
            self.assertEqual(replace.call_count, 7)
            self.assertLessEqual(sum(call.args[0] for call in delay.call_args_list), 1)
            self.assertEqual(json.loads(path.read_text()), {'state': 'old'})
            self.assertFalse(list(Path(directory).glob('*.tmp')))

    def test_non_contention_failure_is_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch('market_data_refresh.os.replace', side_effect=OSError('fixture disk failure')) as replace:
                with self.assertRaises(OSError): atomic_json(Path(directory) / 'status.json', {'state':'new'})
            self.assertEqual(replace.call_count, 1)
            self.assertFalse(list(Path(directory).glob('*.tmp')))


if __name__ == '__main__': unittest.main()
