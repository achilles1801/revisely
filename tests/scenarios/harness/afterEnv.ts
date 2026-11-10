import { cleanup } from '@testing-library/react-native';
import { closeAllPhones } from './phone';
import { restoreClock } from './clock';
import { setOnline } from './netinfo';

afterEach(async () => {
  await closeAllPhones();
  // Screens rendered on their own (component scenarios) come down too, and no sheet of this test
  // holds a turn (v2/modalTurn) or stays presented (harness/modal) in the next: one left open would
  // keep the next test's sheets waiting, or have them refused.
  cleanup();
  require('react-native/Libraries/Modal/Modal').resetModalsForTests();
  require('../../../src/components/v2/modalTurn').resetModalTurnsForTests();
  setOnline(true);
  restoreClock();
});
