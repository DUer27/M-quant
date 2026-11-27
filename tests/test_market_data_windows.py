"""Exercise the actual Windows PowerShell launcher in an isolated deployment."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


@unittest.skipUnless(sys.platform == 'win32', 'Windows launcher integration')
class WindowsLauncherTests(unittest.TestCase):
    def test_worker_success_skip_and_failure_propagate_with_receipts(self):
        root = Path(tempfile.mkdtemp(prefix='mquant-launcher-'))
        source = Path(__file__).resolve().parents[1] / 'tools/windows/Run-Daily-MarketData.ps1'
        shutil.copyfile(source, root / source.name)
        repository = root / 'repository'
        config = repository / 'platform/quant-factor-platform/config/market-data.json'
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({'enabled': True, 'schedule_time': '18:30'}), encoding='utf-8')
        (root / 'deployment.json').write_text(json.dumps({'repository': str(repository), 'python': sys.executable}), encoding='utf-8')
        script = repository / 'tools/market_data_refresh.py'
        script.parent.mkdir(parents=True)
        for state, exit_code in [('ready', 0), ('skipped', 0), ('failed', 7)]:
            with self.subTest(state=state):
                script.write_text('import json,sys\nprint(json.dumps(' + repr({'state': state, 'message': 'fixture only'}) + '))\nsys.exit(' + str(exit_code) + ')\n', encoding='utf-8')
                process = subprocess.run([str(Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
                                          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(root / source.name)],
                                         capture_output=True, timeout=30)
                receipt = json.loads((repository / 'outputs/live-market-data/scheduler-status.json').read_text(encoding='utf-8-sig'))
                self.assertEqual(process.returncode, exit_code, process.stderr.decode(errors='replace'))
                self.assertEqual(receipt['state'], state)
                self.assertEqual(receipt['exit_code'], exit_code)
                self.assertTrue(receipt['finished_at'].endswith('+08:00'))


if __name__ == '__main__':
    unittest.main()
