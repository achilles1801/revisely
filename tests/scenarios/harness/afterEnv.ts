import { closeAllPhones } from './phone';
import { restoreClock } from './clock';
import { setOnline } from './netinfo';

afterEach(async () => {
  await closeAllPhones();
  setOnline(true);
  restoreClock();
});
