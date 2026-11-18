"""digest.py's Markdown from health lines as Cloud Logging returns them (no network: the entries are made here)."""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import digest  # noqa: E402


def entry(payload, rev='recite-check-00056-abc', inst='i1'):
    return {'jsonPayload': payload, 'resource': {'labels': {'revision_name': rev}}, 'labels': {'instanceId': inst}}


NOW = dt.datetime(2026, 11, 22, 15, 0, tzinfo=dt.timezone.utc)


class Digest(unittest.TestCase):
    def test_nothing(self):
        self.assertIn('No health lines in this span.', digest.summarize([], 7, NOW))

    def test_a_week(self):
        lines = [
            entry({'health': 'instance', 'imports_s': 3.1, 'engine_s': 0.4, 'ready_s': 6.2, 'words': True, 'bench_ms': 30}),
            entry({'health': 'take', 'kind': 'live', 'level': 'recite', 'audio_s': 600, 'open_s': 610, 'ready_s': 4.5,
                   'cold': True, 'sockets': 1, 'why': 'end', 'marks': 0, 'lag_p50': 0.01, 'lag_p90': 0.4,
                   'lag_max': 1.2, 'model_per_s': 0.2, 'cpu_per_s': 0.3}),
            entry({'health': 'take', 'kind': 'live', 'level': 'strict', 'audio_s': 300, 'open_s': 302, 'ready_s': 0.2,
                   'cold': False, 'sockets': 2, 'why': 'end', 'marks': 7, 'kept': True, 'lag_p50': 0.02,
                   'lag_p90': 0.6, 'lag_max': 2.0, 'model_per_s': 0.24, 'cpu_per_s': 0.55, 'done_s': 0.8,
                   'names_after_ms': 1900, 'gate_ms': 150}),
            entry({'health': 'take', 'kind': 'check', 'v': 2, 'level': 'harakat', 'audio_s': 60, 'wall_s': 8,
                   'marks': 2, 'kept': False}),
            entry({'health': 'refused', 'route': 'live', 'reason': 'limit'}),
            entry({'health': 'dropped', 'at': 'timeout', 'audio_s': 40, 'restarted': False}),
            entry({'health': 'label', 'kind': 'dismiss'}), entry({'health': 'label', 'kind': 'undismiss'}),
            {'jsonPayload': {'message': 'not a health line'}},
        ]
        md = digest.summarize(lines, 7, NOW)
        self.assertIn('Revisions: recite-check-00056-abc.', md)
        self.assertIn('| live · recite | 1 | 10.0 min | 600 s | 0/0 | 0 |', md)
        self.assertIn('| live · strict | 1 | 5.0 min | 300 s | 1/1 | 7 |', md)
        self.assertIn('3 takes, 0.27 h of audio.', md)
        self.assertIn('Live takes that were their instance\'s first: 1 of 2 (50%).', md)
        self.assertIn('Instances started: 1. Process start → ready: median 6.2 s', md)
        self.assertIn('Live takes resumed on the same instance: 1; started again on another: 0.', md)
        self.assertIn('Refused: live / limit 1.', md)
        self.assertIn('- Connect → `ready`, Mark mistakes: median 0.20 s, p90 0.20 s; the Premium check in it: median 0.15 s, '
                      'p90 0.15 s (1 takes).', md)
        self.assertIn('Stop → the summary (`done`), Mark mistakes: median 0.80 s, p90 0.80 s, worst 0.80 s (1 takes); '
                      'the names after it (namesAfter, 1 takes): median 1.90 s, worst 1.90 s.', md)
        self.assertIn('Dropped (the phone went and never came back here): 1 (timeout 1).', md)
        self.assertIn('"Not a mistake": dismiss 1, undismiss 1.', md)
        # held: 610 + 302 (sockets) + 8 (check) + 40 (the drop's audio) + 6.2 (start) = 966.2 s
        self.assertIn('Instance time held: 0.27 h (966 vCPU-s, 1,932 GiB-s)', md)
        self.assertNotIn('None', md)

    def test_production_and_app_check(self):
        """--project names production in the heading; the take lines' App Check results (APP_CHECK log) are counted."""
        lines = [entry({'health': 'take', 'kind': 'live', 'level': 'harakat+letters', 'audio_s': 60, 'open_s': 61,
                        'appcheck': a}) for a in ('ok', 'ok', 'missing')]
        lines.append(entry({'health': 'refused', 'route': 'live', 'reason': 'app_check'}))
        md = digest.summarize(lines, 7, NOW, project=digest.PROD)
        self.assertIn('## Recitation checker in production, the last 7 days', md)
        self.assertIn('App Check (APP_CHECK log or on), takes: missing 1, ok 2.', md)
        self.assertIn('Refused: live / app_check 1.', md)
        dev = digest.summarize(lines[:1], 7, NOW)
        self.assertIn('## Recitation checker, the last 7 days', dev)
        self.assertNotIn('App Check', digest.summarize([entry({'health': 'take', 'kind': 'live', 'level': 'recite',
                                                              'audio_s': 5, 'open_s': 6})], 7, NOW))

    def test_two_takes_at_once_on_the_pair_service_hold_one_instance(self):
        def take(end, open_s, inst):
            e = entry({'health': 'take', 'kind': 'live', 'level': 'recite', 'audio_s': open_s, 'open_s': open_s},
                      inst=inst)
            e['resource']['labels']['service_name'] = 'recite-check-pair'
            e['timestamp'] = f'2026-11-22T14:{end}Z'
            return e
        # i1: 14:00:00–14:05:00 and 14:02:00–14:06:00 overlap (6 min); i2: 14:00:00–14:01:00 (1 min)
        md = digest.summarize([take('05:00', 300, 'i1'), take('06:00', 240, 'i1'), take('01:00', 60, 'i2')], 7, NOW)
        self.assertIn('| live · recite (pair) | 3 |', md)
        self.assertIn('Instance time held: 0.12 h (420 vCPU-s', md)

    def test_takes_and_instance_speed_by_model(self):
        md = digest.summarize([
            entry({'health': 'take', 'kind': 'live', 'level': 'recite', 'ear': 'v6', 'audio_s': 60, 'model_per_s': 0.3}),
            entry({'health': 'take', 'kind': 'live', 'level': 'strict', 'ear': 'released+v5', 'audio_s': 60,
                   'model_per_s': 0.25}),
            entry({'health': 'take', 'kind': 'live', 'level': 'strict', 'audio_s': 60, 'model_per_s': 0.2}),  # before `ear`
        ], 7, NOW)
        self.assertIn('| live · recite · v6 | 1 |', md)
        self.assertIn('| live · strict · released+v5 | 1 |', md)
        self.assertIn('| live · strict | 1 |', md)
        self.assertIn('released 0.200–0.250, median 0.250; v6 0.300–0.300, median 0.300.', md)


if __name__ == '__main__':
    unittest.main()
