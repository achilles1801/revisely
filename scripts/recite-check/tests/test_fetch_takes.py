"""fetch_takes.dismissed_now: how the lab reads a take's "Not a mistake" labels, with Undo."""
import json
import pathlib
import tempfile
import unittest

import fetch_takes

TAKE = '20261115-101010-abcdef'


class DismissedNowTests(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())

    def write(self, name, data):
        (self.dir / name).write_text(json.dumps(data))

    def test_the_live_list_alone(self):
        self.write(f'{TAKE}.json', {'mode': 'live', 'dismissed': ['1:skipped:', '2:word:sound']})
        self.assertEqual(fetch_takes.dismissed_now(self.dir / f'{TAKE}.json'), {'1:skipped:', '2:word:sound'})

    def test_the_latest_label_for_a_mark_wins(self):
        self.write(f'{TAKE}.json', {'mode': 'live', 'dismissed': ['1:skipped:']})
        # undone after the fact; 2 dismissed, undone, dismissed again; 3 dismissed then undone, stored out of order
        self.write(f'{TAKE}.undismiss-a.json', {'take': TAKE, 'id': '1:skipped:', 'at': 100.0, 'undo': True})
        self.write(f'{TAKE}.dismiss-b.json', {'take': TAKE, 'id': '2:word:sound', 'at': 101.0})
        self.write(f'{TAKE}.undismiss-c.json', {'take': TAKE, 'id': '2:word:sound', 'at': 102.0, 'undo': True})
        self.write(f'{TAKE}.dismiss-d.json', {'take': TAKE, 'id': '2:word:sound', 'at': 103.0})
        self.write(f'{TAKE}.undismiss-e.json', {'take': TAKE, 'id': '3:added:', 'at': 104.0, 'when': 104000,
                                                'undo': True})
        self.write(f'{TAKE}.dismiss-f.json', {'take': TAKE, 'id': '3:added:', 'at': 104.5, 'when': 103500})
        # another take's labels don't count
        self.write('20261115-101011-ffffff.dismiss-g.json', {'id': '1:skipped:', 'at': 200.0})
        self.assertEqual(fetch_takes.dismissed_now(self.dir / f'{TAKE}.json'), {'2:word:sound'})

    def test_label_files_are_not_takes(self):
        for name in (f'{TAKE}.dismiss-a.json', f'{TAKE}.undismiss-a.json', f'{TAKE}.part-a.json'):
            self.assertTrue(any(x in name for x in fetch_takes.LABELS), name)
        self.assertFalse(any(x in f'{TAKE}.json' for x in fetch_takes.LABELS))


if __name__ == '__main__':
    unittest.main()
